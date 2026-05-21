const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const qrcode = require('qrcode-terminal');
const https = require('https');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');
let sock = null;
let baileysLoad = null;

function loadBaileys() {
  if (!baileysLoad) {
    baileysLoad = import('@whiskeysockets/baileys');
  }
  return baileysLoad;
}

function toJid(numero) {
  const digits = numero.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

async function sendMessage(to, text) {
  if (!sock) {
    console.log(`[WA MOCK → ${to}]: ${text}`);
    return;
  }
  await sock.sendMessage(toJid(to), { text });
}

async function init(onMessage) {
  const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = await loadBaileys();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escanea este código QR con WhatsApp (Vincular dispositivo):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 0;
      if (code === DisconnectReason.loggedOut) {
        console.log('Sesión de WhatsApp cerrada. Borra auth_info_baileys/ y reinicia para re-vincular.');
      } else {
        console.log(`WhatsApp desconectado (${code}), reconectando…`);
        init(onMessage);
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp conectado');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';
      if (!text) continue;

      const from = jid.replace('@s.whatsapp.net', '');
      try {
        await onMessage({ from, text, messageId: msg.key.id });
      } catch (err) {
        console.error('Error procesando mensaje entrante:', err.message);
      }
    }
  });
}

// ── Whapi.cloud ───────────────────────────────────────────────────────────────

function whapiRequest(path, method, body) {
  const token = process.env.WHAPI_TOKEN;
  if (!token) return Promise.reject(new Error('WHAPI_TOKEN no configurado'));

  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://gate.whapi.cloud${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Whapi timeout (15s)'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function checkWhapiHealth() {
  try {
    const { status, data } = await whapiRequest('/health', 'GET');
    if (status !== 200) {
      return { ok: false, status, detail: data };
    }
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return { ok: true, detail: data };
    }
    const waId = parsed.user?.id;
    const channelStatus = parsed.status?.text;
    // code 4 = AUTH: sesión conectada (Whapi)
    const connected = channelStatus === 'AUTH' || parsed.status?.code === 4;
    return {
      ok: connected,
      waId,
      channelStatus,
      channelId: parsed.channel_id,
      detail: data,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sendMessageWhapi(to, text) {
  const token = process.env.WHAPI_TOKEN;
  if (!token) {
    console.log(`[WHAPI MOCK → ${to}]: ${text}`);
    return;
  }

  const digits = to.replace(/\D/g, '');
  const chatId = `${digits}@s.whatsapp.net`;

  const { status, data } = await whapiRequest('/messages/text', 'POST', {
    to: chatId,
    body: text,
    typing_time: 0,
  });

  if (status >= 200 && status < 300) {
    return { ok: true };
  }

  const err = new Error(`Whapi error ${status}: ${data}`);
  console.error(`❌ No se pudo enviar WA a ${digits}:`, err.message);
  throw err;
}

async function checkWhapiWebhook() {
  try {
    const { status, data } = await whapiRequest('/settings', 'GET');
    if (status !== 200) return { ok: false, mensaje: `settings HTTP ${status}` };
    const settings = JSON.parse(data);
    const url = settings.webhooks?.[0]?.url || '';
    if (!url) {
      return { ok: false, mensaje: 'no hay URL de webhook configurada' };
    }
    if (!url.replace(/\/$/, '').endsWith('/webhook')) {
      return {
        ok: false,
        mensaje: `URL actual "${url}" debe terminar en /webhook`,
        url,
      };
    }
    return { ok: true, url };
  } catch (err) {
    return { ok: false, mensaje: err.message };
  }
}

module.exports = { sendMessage, sendMessageWhapi, checkWhapiHealth, checkWhapiWebhook, init };
