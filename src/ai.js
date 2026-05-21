const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

let geminiClient = null;
let groqClient = null;

function getGemini() {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
}

function getGroq() {
  if (!groqClient && process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

// Gemini tool format → Groq/OpenAI tool format
function toGroqTools(geminiTools) {
  if (!geminiTools) return undefined;
  const tools = [];
  for (const toolSet of geminiTools) {
    for (const fn of toolSet.functionDeclarations || []) {
      tools.push({ type: 'function', function: { name: fn.name, description: fn.description, parameters: fn.parameters } });
    }
  }
  return tools.length > 0 ? tools : undefined;
}

function toGeminiHistory(messages) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function chat({ systemPrompt, messages, tools = null }) {
  try {
    return await chatGemini({ systemPrompt, messages, tools });
  } catch (err) {
    console.warn('Gemini falló, usando Groq fallback:', err.message);
    return await chatGroq({ systemPrompt, messages, tools });
  }
}

async function chatGemini({ systemPrompt, messages, tools }) {
  const genai = getGemini();
  if (!genai) throw new Error('GEMINI_API_KEY no configurada');

  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ].filter(Boolean);

  // Gemini exige que el historial empiece con rol 'user' — descartar mensajes de model al inicio
  const rawHistory = toGeminiHistory(messages.slice(0, -1));
  const firstUserIdx = rawHistory.findIndex(m => m.role === 'user');
  const history = firstUserIdx > 0 ? rawHistory.slice(firstUserIdx) : rawHistory;
  const lastMessage = messages[messages.length - 1].content;

  let lastErr = null;
  for (const modelName of candidateModels) {
    try {
      const model = genai.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
      const chatSession = model.startChat({ history, ...(tools ? { tools } : {}) });
      const result = await chatSession.sendMessage(lastMessage);
      const response = result.response;

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.functionCall) {
          return {
            type: 'function_call',
            name: part.functionCall.name,
            args: part.functionCall.args,
            _session: chatSession,
          };
        }
      }
      return { type: 'text', content: response.text() };
    } catch (e) {
      const isQuota = e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('Too Many Requests');
      if (isQuota) {
        throw e; // No tiene sentido probar otros modelos del mismo tier
      }
      console.warn(`Gemini modelo ${modelName} falló:`, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Todos los modelos de Gemini fallaron');
}

async function chatGroq({ systemPrompt, messages, tools = null, _allMessages = null }) {
  const groq = getGroq();
  if (!groq) throw new Error('GROQ_API_KEY no configurada');

  const groqTools = toGroqTools(tools);
  const allMessages = _allMessages || [{ role: 'system', content: systemPrompt }, ...messages];

  const candidateModels = [
    process.env.GROQ_MODEL,
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); // únicos

  let completion;
  let lastErr;
  for (const model of candidateModels) {
    try {
      completion = await groq.chat.completions.create({
        model,
        messages: allMessages,
        max_tokens: 600,
        ...(groqTools ? { tools: groqTools, tool_choice: 'auto' } : {}),
      });
      break;
    } catch (e) {
      const isLimit = e.message?.includes('rate_limit') || e.message?.includes('Rate limit') || e.status === 429;
      console.warn(`Groq modelo ${model} falló:`, e.message?.slice(0, 80));
      lastErr = e;
      if (!isLimit) throw e; // error no relacionado con límite → no reintentar
    }
  }
  if (!completion) throw lastErr || new Error('Todos los modelos de Groq fallaron');

  const msg = completion.choices[0]?.message;
  if (msg?.tool_calls?.length > 0) {
    const toolCall = msg.tool_calls[0];
    return {
      type: 'function_call',
      name: toolCall.function.name,
      args: JSON.parse(toolCall.function.arguments),
      _session: {
        _provider: 'groq',
        _messages: [...allMessages, msg],
        _toolCallId: toolCall.id,
        _systemPrompt: systemPrompt,
        _tools: tools,
      },
    };
  }

  // Groq/Llama a veces devuelve la function call como texto plano en vez de tool_calls
  const content = msg?.content || '';
  const fnMatch = content.match(/<function=(\w+)>([\s\S]*?)<\/function>/);
  if (fnMatch) {
    try {
      const name = fnMatch[1];
      const args = JSON.parse(fnMatch[2]);
      const fakeId = `text_fn_${Date.now()}`;
      console.warn(`Groq devolvió function call como texto, parseando: ${name}`);
      return {
        type: 'function_call',
        name,
        args,
        _session: {
          _provider: 'groq',
          _messages: [...allMessages, msg],
          _toolCallId: fakeId,
          _systemPrompt: systemPrompt,
          _tools: tools,
        },
      };
    } catch (e) {
      console.warn('No se pudo parsear function call embebida en texto:', e.message);
    }
  }

  return { type: 'text', content };
}

async function sendFunctionResult({ session, functionName, result }) {
  // Groq path
  if (session?._provider === 'groq') {
    const groq = getGroq();
    const { _messages, _toolCallId, _systemPrompt, _tools } = session;
    const newMessages = [
      ..._messages,
      { role: 'tool', tool_call_id: _toolCallId, content: JSON.stringify(result) },
    ];
    const groqTools = toGroqTools(_tools);
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: newMessages,
      max_tokens: 600,
      ...(groqTools ? { tools: groqTools, tool_choice: 'auto' } : {}),
    });
    const msg = completion.choices[0]?.message;
    if (msg?.tool_calls?.length > 0) {
      const toolCall = msg.tool_calls[0];
      return {
        type: 'function_call',
        name: toolCall.function.name,
        args: JSON.parse(toolCall.function.arguments),
        _session: { _provider: 'groq', _messages: [...newMessages, msg], _toolCallId: toolCall.id, _systemPrompt, _tools },
      };
    }
    return { type: 'text', content: msg?.content || '' };
  }

  // Gemini path
  try {
    const response = await session.sendMessage([{
      functionResponse: { name: functionName, response: result },
    }]);

    const parts = response.response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.functionCall) {
        return {
          type: 'function_call',
          name: part.functionCall.name,
          args: part.functionCall.args,
          _session: session,
        };
      }
    }
    return { type: 'text', content: response.response.text() };
  } catch (err) {
    console.warn('Gemini sendFunctionResult falló:', err.message);
    throw err;
  }
}

module.exports = { chat, sendFunctionResult };
