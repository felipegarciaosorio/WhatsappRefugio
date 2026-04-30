const db = require('./database');
const ai = require('./ai');
const { formatCOP, formatFecha } = require('./utils');

const SYSTEM_PROMPT = `Eres el asistente de reservas de Cabaña Risaralda, ubicada en Risaralda, Caldas, Colombia.
Eres cálido, honesto y hablas como un anfitrión colombiano. Usas emojis naturales.
Responde SIEMPRE en español colombiano. Máximo 4 líneas por mensaje.

INFORMACIÓN DE LA CABAÑA:
- Acomodación: 1 cama doble + 1 sofá cama → ideal para parejas
- Capacidad máxima: 4 personas (personas 3 y 4 duermen en el sofá cama)
- WiFi, cocina equipada, zona BBQ, fogón, parqueadero, vista al cafetal
- Mascotas: bienvenidas sin cargo
- Check-in: 3:00 PM del día de llegada
- Check-out: 1:00 PM del día de salida

PRECIOS (explicar con desglose siempre):
- Base 1-2 personas: $350.000 COP por noche + botella de vino incluida
- 3 personas: $420.000/noche ($350.000 + $70.000 por la 3ª persona)
- 4 personas: $490.000/noche ($350.000 + $70.000 + $70.000 por la 4ª persona)
- Máximo 4 personas. Si piden más de 4: "Lo sentimos, la capacidad máxima es 4 personas 🙏"
- NO incluye comidas (cocina completamente equipada disponible)
- Si preguntan por la acomodación: "Tenemos una cama doble y un sofá cama cómodo para las personas adicionales 🛋️"

PAGO:
- Anticipo: 50% del total para confirmar
- Saldo: 50% al llegar
- Medios: Nequi ${process.env.NEQUI_NUMERO || 'NÚMERO_NEQUI'} | Bancolombia ${process.env.BANCO_CUENTA || 'CUENTA_BANCOLOMBIA'}

CUANDO EL USUARIO QUIERA RESERVAR, sigue este flujo en orden:
1. Pedir fecha de llegada (día de check-in, 3pm)
2. Pedir fecha de salida (día de check-out, 1pm)
3. Verificar disponibilidad (LLAMA A LA FUNCIÓN verificar_disponibilidad)
4. Pedir número de personas (validar máximo 4)
5. Si disponible: mostrar cotización CON DESGLOSE (base + adicionales + total + anticipo)
6. Pedir nombre completo
7. Pedir número de cédula
8. Confirmar reserva y enviar instrucciones de pago

IMPORTANTE: No inventes disponibilidad. Siempre verifica antes de cotizar.
IMPORTANTE: Siempre muestra el desglose del precio cuando hay 3 o 4 personas.`;

const GEMINI_TOOLS = [{
  functionDeclarations: [
    {
      name: 'verificar_disponibilidad',
      description: 'Verifica si las fechas están disponibles para reservar',
      parameters: {
        type: 'object',
        properties: {
          fecha_entrada: { type: 'string', description: 'Fecha de llegada YYYY-MM-DD' },
          fecha_salida: { type: 'string', description: 'Fecha de salida YYYY-MM-DD' },
        },
        required: ['fecha_entrada', 'fecha_salida'],
      },
    },
    {
      name: 'crear_reserva',
      description: 'Registra la reserva en el sistema cuando el cliente confirma',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          cedula: { type: 'string' },
          celular: { type: 'string' },
          fecha_entrada: { type: 'string' },
          fecha_salida: { type: 'string' },
          num_personas: { type: 'integer' },
          wa_number: { type: 'string' },
        },
        required: ['nombre', 'celular', 'fecha_entrada', 'fecha_salida', 'wa_number'],
      },
    },
  ],
}];

// Ejecuta la función que Gemini solicitó
function ejecutarFuncion(name, args, waNumber) {
  if (name === 'verificar_disponibilidad') {
    const { disponible, conflictos } = db.verificarDisponibilidad(args.fecha_entrada, args.fecha_salida);
    if (disponible) {
      const precio = db.calcularPrecio(args.fecha_entrada, args.fecha_salida, 2);
      return {
        disponible: true,
        mensaje: `Fechas disponibles del ${formatFecha(args.fecha_entrada)} al ${formatFecha(args.fecha_salida)}`,
        precio_base_2personas: {
          noches: precio.noches,
          tarifa_por_noche: formatCOP(precio.tarifaNoche),
          total: formatCOP(precio.total),
          anticipo: formatCOP(precio.anticipo),
        },
      };
    }
    return {
      disponible: false,
      mensaje: 'Esas fechas no están disponibles',
      dias_conflicto: conflictos.map(c => c.dia),
    };
  }

  if (name === 'crear_reserva') {
    const { disponible } = db.verificarDisponibilidad(args.fecha_entrada, args.fecha_salida);
    if (!disponible) {
      return { ok: false, error: 'Las fechas ya no están disponibles' };
    }
    const resultado = db.crearReserva({
      nombre: args.nombre,
      cedula: args.cedula,
      celular: args.celular || waNumber,
      fecha_entrada: args.fecha_entrada,
      fecha_salida: args.fecha_salida,
      num_personas: args.num_personas || 2,
      wa_number: waNumber,
    });
    const precio = db.calcularPrecio(args.fecha_entrada, args.fecha_salida, args.num_personas || 2);
    return {
      ok: true,
      id_reserva: resultado.id,
      total: formatCOP(precio.total),
      anticipo: formatCOP(precio.anticipo),
      nequi: process.env.NEQUI_NUMERO,
      banco: process.env.BANCO_CUENTA,
    };
  }

  return { error: `Función desconocida: ${name}` };
}

async function procesarMensaje(waNumber, texto) {
  // Guardar mensaje entrante
  db.guardarMensaje(waNumber, 'entrante', texto);

  // Obtener o crear conversación
  let conv = db.getConversacion(waNumber);
  const historial = db.getMensajes(waNumber, 30);

  // Construir mensajes para el modelo
  const messages = historial.map(m => ({
    role: m.direccion === 'entrante' ? 'user' : 'assistant',
    content: m.contenido,
  }));

  // Asegurarse de que el último mensaje es el actual
  if (!messages.length || messages[messages.length - 1].content !== texto) {
    messages.push({ role: 'user', content: texto });
  }

  try {
    let respuesta = await ai.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages,
      tools: GEMINI_TOOLS,
    });

    // Ciclo de function calling
    let maxIter = 5;
    while (respuesta.type === 'function_call' && maxIter-- > 0) {
      const fnResult = ejecutarFuncion(respuesta.name, respuesta.args, waNumber);
      respuesta = await ai.sendFunctionResult({
        session: respuesta._session,
        functionName: respuesta.name,
        result: fnResult,
      });
    }

    const textoRespuesta = respuesta.type === 'text' ? respuesta.content : 'Lo siento, ocurrió un error. Por favor intenta de nuevo.';

    db.guardarMensaje(waNumber, 'saliente', textoRespuesta);
    db.upsertConversacion(waNumber, 'activa', conv?.context || {});

    return textoRespuesta;
  } catch (err) {
    console.error('Error en agente:', err.message);
    const errorMsg = 'Disculpa, estoy teniendo problemas técnicos. Por favor escríbenos en unos minutos 🙏';
    db.guardarMensaje(waNumber, 'saliente', errorMsg);
    return errorMsg;
  }
}

module.exports = { procesarMensaje };
