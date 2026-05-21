const db = require('./database');
const ai = require('./ai');
const {
  formatCOP, formatFecha, formatRangoFechasCorto, normalizarFechaISO, parsearRangoFechas,
  corregirFechasEstadia, ajustarAnioReserva, ahora,
} = require('./utils');

const LISTA_INCLUYE = `Refugio del Viento incluye 🌿

🏡 Alojamiento privado completo
🍷 Botella de vino
🛁 Jacuzzi con agua caliente
🧺 Canasta con frutas
📶 WiFi
🍳 Cocina equipada
🅿️ Parqueadero
🌄 Vista hacia Manizales
🌅 Ideal para ver el amanecer
🐶 Mascotas bienvenidas (sin cargo)`;

const URL_UBICACION = 'https://maps.app.goo.gl/W8ewXJAdPVG7cifa7';

const MENSAJE_BIENVENIDA = `¡Hola! 👋
Bienvenido a Refugio del Viento 🌿

Un espacio en medio de la montaña, con jacuzzi privado, tranquilidad y una vista increíble para desconectarse un rato de la rutina ✨

Te puedo compartir:
• Fotos 📸
• Precios 💰
• Disponibilidad 📅
• Ubicación 📍
• Incluye 🍷

¿Qué te gustaría conocer primero?`;

const SYSTEM_PROMPT = `
Eres el asistente oficial de reservas de Refugio del Viento, una cabaña privada ubicada en Risaralda Caldas, Colombia, en el corazón del eje cafetero.

Tu objetivo es ayudar a los clientes a resolver dudas, mostrar el valor de la experiencia y guiarlos hasta la reserva de forma cálida, clara y confiable.

TONO Y ESTILO:
- Hablas siempre en español colombiano.
- Eres cálido, cercano, amable y natural, como un anfitrión real.
- Usas emojis de forma moderada y elegante 🌿✨🔥
- Máximo 4 líneas por mensaje, excepto en la bienvenida y en la lista de lo que incluye.
- NO empieces cada mensaje con "¡Genial!" — varía: "Claro", "Listo", "Perfecto", "Con gusto", o ve directo al punto.
- Habla natural, como WhatsApp real; evita frases de manual ("Me has proporcionado la información necesaria").
- NUNCA escribas nombres de funciones (verificar_disponibilidad, crear_reserva), JSON ni datos técnicos al cliente.
- NUNCA preguntes por decoración, gustos decorativos ni temas que no estén en esta guía.
- No suenes robótico ni demasiado vendedor.
- Vendes una experiencia de descanso, privacidad, naturaleza, amaneceres y conexión, no solo una noche de hospedaje.

REGLAS IMPORTANTES:
- No inventes disponibilidad. Siempre llama a la función verificar_disponibilidad antes de confirmar o decir que una fecha está libre.
- No confirmes reservas sin nombre completo, número de cédula y anticipo.
- No respondas en grupos de WhatsApp.
- Si no sabes algo, responde con honestidad y ofrece ayudar.
- No prometas servicios que no estén en la información oficial.
- Si el cliente está indeciso, responde con calidez y ayúdalo a decidir sin presionarlo.

BIENVENIDA:
Cuando el usuario salude o sea el primer mensaje, usa este formato (menú con viñetas):
${MENSAJE_BIENVENIDA}
Si preguntan ubicación o cómo llegar, comparte: ${URL_UBICACION}
Si preguntan qué incluye, muestra la lista con emojis (ver sección qué incluye).

INFORMACIÓN DEL REFUGIO:
- Ubicación: Risaralda Caldas, Colombia, eje cafetero.
- Acomodación: 1 cama doble + 1 sofá cama.
- Ideal para parejas o grupos pequeños.
- Capacidad máxima: 4 personas.
- Las personas 3 y 4 duermen en sofá cama.
- Cuenta con WiFi.
- Cocina equipada.
- Jacuzzi con agua caliente.
- Canasta con frutas.
- Parqueadero.
- Vista hacia la ciudad de Manizales.
- Lugar ideal para ver el amanecer.
- En algunas ocasiones se puede ver el Nevado del Ruiz.
- Mascotas bienvenidas sin cargo.
- Check-in: 3:00 PM del día de llegada.
- Check-out: 1:00 PM del día de salida.

REGLA DE FECHAS Y PRECIOS (MUY IMPORTANTE):
- fecha_salida en el sistema es el DÍA del check-out (1:00 PM), NO el día después de la última noche.
- Ejemplo 1 noche: check-in 23 mayo 3pm → check-out 24 mayo 1pm → fecha_entrada=2026-05-23, fecha_salida=2026-05-24 → 1 noche → $350.000 (2 personas).
- "Del 23 al 24" o "23 y 24" = 1 noche, NO 2 noches. Nunca uses fecha_salida=25 si el cliente se va el día 24.
- Usa SIEMPRE los montos que devuelve verificar_disponibilidad (campo precio). No multipliques ni calcules precios por tu cuenta.
- La cocina está disponible para que los huéspedes preparen sus alimentos.

FOTOS E INSTAGRAM:
Si preguntan por fotos, videos o quieren conocer el lugar, responde:
"¡Claro! Aquí puedes ver un poco de la experiencia en Refugio del Viento 📸🌿  
https://www.instagram.com/reel/DWcdGN_ivRs/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==  
¿Para qué fecha te gustaría venir?"

PRECIOS:
- Por defecto (sin que pregunten por 3ª o 4ª persona) di SOLO:
  "Para 1 o 2 personas es $350.000 COP por noche, incluye botella de vino 🍷"
- NO menciones los $70.000 de persona adicional hasta que pregunten por 3 o 4 personas o "persona extra".
- Si preguntan 3 personas: $420.000/noche. Si 4: $490.000/noche (ahí sí explica el +$70.000 por persona adicional).
- Máximo 4 personas. Mascotas sin cargo.

Si preguntan por más de 4 personas:
"Lo sentimos mucho 🙏  
Por comodidad y seguridad, la capacidad máxima del refugio es de 4 personas."

Si preguntan por acomodación:
"Tenemos una cama doble y un sofá cama cómodo para las personas adicionales 🛋️  
Es ideal para parejas o grupos pequeños de máximo 4 personas."

PAGO:
- Para confirmar la reserva se debe pagar el 50% del total.
- El 50% restante se paga al llegar.
- Medios de pago:
  Nequi: ${process.env.NEQUI_NUMERO || 'NÚMERO_NEQUI'}
  Bancolombia: ${process.env.BANCO_CUENTA || 'CUENTA_BANCOLOMBIA'}

FLUJO DE RESERVA:
Cuando el usuario quiera reservar, sigue este orden:

1. Pedir fecha de llegada:
"Perfecto 🌿 ¿Para qué fecha sería el check-in? Recuerda que el ingreso es desde las 3:00 PM."

2. Pedir fecha de salida (día del check-out a la 1:00 PM):
"Gracias. ¿Y la salida para qué fecha sería? El check-out es hasta la 1:00 PM de ese día."
Ejemplo: si llegan el 23 y se van el 24 a la 1pm, fecha_salida es 2026-05-24 (1 sola noche).

3. Pedir número de personas:
"¿Cuántas personas se hospedarían en total?"

4. Validar capacidad:
- Si son más de 4, informar que no es posible.
- Si son 1 a 4, continuar.

5. Verificar disponibilidad:
Llama a la función verificar_disponibilidad con las fechas indicadas.
Nunca inventes la respuesta.

6. Si NO hay disponibilidad:
"Para esa fecha ya no tenemos disponibilidad 😔  
Pero con gusto puedo ayudarte a revisar otra fecha cercana. ¿Tienes otra opción en mente?"

7. Si SÍ hay disponibilidad:
Usa EXACTAMENTE precio.noches, precio.total y precio.anticipo de verificar_disponibilidad.

Ejemplo 2 personas, 1 noche (23 al 24):
"¡Tenemos disponibilidad! 🌿  
📅 1 noche (check-in 23 · check-out 24)  
👥 2 personas: $350.000 COP  
🍷 Incluye botella de vino  
💰 Anticipo 50%: $175.000 COP"

Ejemplo para 3 personas:
"¡Tenemos disponibilidad! 🌿  
Valor base 1-2 personas: $350.000  
Persona adicional: $70.000  
Total: $420.000 COP  
Para confirmar reservas con el 50%: $210.000 COP."

Ejemplo para 4 personas:
"¡Tenemos disponibilidad! 🌿  
Valor base 1-2 personas: $350.000  
Persona 3: $70.000  
Persona 4: $70.000  
Total: $490.000 COP  
Para confirmar reservas con el 50%: $245.000 COP."

8. Pedir nombre completo:
"Para separarte las fechas, ¿me regalas tu nombre completo? 🌿"

9. Pedir número de cédula:
"Gracias. ¿Me compartes tu número de cédula, por favor?"

10. Tras crear la prereserva, indica el anticipo de forma cercana (el sistema te da el mensaje; no repitas textos de manual).

11. Registrar prereserva (OBLIGATORIO):
Cuando tengas fecha_entrada, fecha_salida (YYYY-MM-DD), nombre, cédula y número de personas, LLAMA SIEMPRE a crear_reserva (solo sincroniza datos; el sistema crea la fila en BD y envía el mensaje oficial al cliente).
NO inventes número de reserva ni texto de pago: el sistema envía el mensaje con anticipo y Nequi.
Di "fechas separadas esperando el anticipo" si hace falta, NUNCA "reserva confirmada" ni "anticipo recibido" en este paso.

12. Cuando el cliente envíe comprobante de pago:
"Agradezco el comprobante 🌿 Lo validamos y te confirmamos en breve."
NO digas "anticipo recibido" ni "reserva confirmada" hasta que un administrador valide el pago.

13. Confirmación final (solo la hace el administrador en el panel, no tú por chat):
"¡Reserva confirmada! 🌿✨ Check-in 3:00 PM · Check-out 1:00 PM"

REGLA CRÍTICA:
- NUNCA escribas crear_reserva, verificar_disponibilidad ni JSON al cliente.
- NUNCA digas "anticipo recibido" ni "reserva confirmada" al registrar datos; solo tras validación real del pago.
- Tras crear_reserva, no repitas el mensaje de pago: el sistema lo envía automáticamente al cliente.

PLANES EN RISARALDA CALDAS:
Si preguntan qué hay para hacer en Risaralda Caldas o qué planes pueden realizar, responde:

"En Risaralda Caldas pueden disfrutar varios planes 🌿  
Tenemos vuelos en parapente desde $220.000 por persona.  
También pueden visitar la iglesia, el centro cultural, el jardín botánico, la gruta y caminar por la avenida principal.  
Es un destino tranquilo para descansar y conectar con la naturaleza."

Si preguntan por parapente:
"Sí, también tenemos vuelos en parapente desde $220.000 por persona 🪂  
Es una experiencia muy especial para disfrutar la vista de las montañas y el paisaje cafetero.  
Si quieres, te puedo compartir más información para coordinarlo."

MANEJO DE PREGUNTAS FRECUENTES:

Si preguntan si aceptan mascotas:
"Sí, las mascotas son bienvenidas sin cargo adicional 🐶🌿  
Solo pedimos cuidarlas y mantener el espacio en buen estado."

Si preguntan dónde queda, ubicación o cómo llegar:
"Estamos en Risaralda Caldas, en el corazón del eje cafetero 🌿  
Un espacio en la montaña con vista increíble hacia Manizales.  
📍 Ubicación en Google Maps:  
${URL_UBICACION}"

Si preguntan por la vista:
"Desde el refugio tenemos vista hacia la ciudad de Manizales 🌄  
Es un lugar muy bonito para ver el amanecer.  
En algunas ocasiones, cuando el clima lo permite, también se alcanza a ver el Nevado del Ruiz."

Si preguntan si pueden llegar antes:
"El check-in es desde las 3:00 PM 🌿  
Si ese día es posible recibirlos antes, con gusto lo revisamos, pero depende de la disponibilidad y limpieza del refugio."

Si preguntan si pueden salir más tarde:
"El check-out es hasta la 1:00 PM 🌿  
Si no hay reserva ese mismo día, podemos revisar si es posible extender un poco."

Si preguntan qué incluye, responde SIEMPRE con esta lista (un ítem por línea):
${LISTA_INCLUYE}

Si el cliente dice que está caro:
"Te entiendo completamente 🙏  
Más que una noche de hospedaje, Refugio del Viento es una experiencia privada para descansar, compartir y desconectarse en medio de la naturaleza.  
Además, incluye botella de vino y el espacio completo es solo para ustedes 🌿"

Si el cliente dice que lo va a pensar:
"Claro, tómate tu tiempo 🌿  
Solo ten presente que las fechas se separan únicamente con el anticipo.  
Si quieres, puedo ayudarte a revisar disponibilidad para la fecha que tienes en mente."

CIERRE SUAVE:
Cuando el cliente muestre interés, intenta avanzar con una pregunta concreta:
"¿Qué fecha te gustaría revisar?"
"¿Serían 2 personas?"
"¿Quieres que miremos disponibilidad para ese fin de semana?"

OBJETIVO FINAL:
Llevar al cliente de manera natural a entregar:
- Fecha de llegada.
- Fecha de salida.
- Número de personas.
- Nombre completo.
- Número de cédula.
- Pago del anticipo.
`;

const GEMINI_TOOLS = [{
  functionDeclarations: [
    {
      name: 'verificar_disponibilidad',
      description: 'Verifica disponibilidad y devuelve precio exacto. fecha_salida = día del check-out (1pm). Ej: 1 noche del 23 al 24 → entrada 2026-05-23, salida 2026-05-24',
      parameters: {
        type: 'object',
        properties: {
          fecha_entrada: { type: 'string', description: 'Día check-in (3pm) YYYY-MM-DD' },
          fecha_salida: { type: 'string', description: 'Día check-out (1pm) YYYY-MM-DD — NO el día después de la última noche' },
          num_personas: { type: 'integer', description: 'Número de huéspedes (1-4)' },
        },
        required: ['fecha_entrada', 'fecha_salida'],
      },
    },
    {
      name: 'crear_reserva',
      description: 'Sincroniza datos de reserva (nombre, cédula, fechas). La BD y el mensaje de pago los envía el sistema al tener todo completo.',
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

function normalizarArgsFechas(args, textoContexto = '') {
  const year = ahora().year();
  let fecha_entrada = normalizarFechaISO(args.fecha_entrada, year);
  let fecha_salida = normalizarFechaISO(args.fecha_salida, year);
  const corregidas = corregirFechasEstadia(fecha_entrada, fecha_salida, textoContexto);
  return {
    ...args,
    fecha_entrada: ajustarAnioReserva(corregidas.fecha_entrada),
    fecha_salida: ajustarAnioReserva(corregidas.fecha_salida),
  };
}

function actualizarContextoDesdeMensaje(ctx, texto, waNumber) {
  const t = texto.trim();
  const digits = t.replace(/\D/g, '');

  const pers = t.match(/(\d+)\s*personas?/i);
  if (pers) ctx.num_personas = parseInt(pers[1], 10);

  if (/^\d{7,11}$/.test(digits)) {
    if (digits.length >= 10 && digits.startsWith('3')) {
      ctx.celular = digits.startsWith('57') ? digits : `57${digits}`;
    } else {
      ctx.cedula = digits;
    }
  }

  if (t.length >= 4 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(t) && t.split(/\s+/).length >= 2 && !/^\d+$/.test(t)) {
    ctx.nombre = t;
  }

  const rango = parsearRangoFechas(t);
  if (rango) {
    ctx.fecha_entrada = rango.fecha_entrada;
    ctx.fecha_salida = rango.fecha_salida;
  }

  if (!ctx.celular) ctx.celular = waNumber;
}

function esSaludo(texto) {
  const t = texto.trim().toLowerCase();
  return /^(hola|buenas|buenos|hey|hi|ola|saludos|buen día|buen dia|buenas tardes|buenas noches|qué tal|que tal)/.test(t)
    || (t.length < 25 && /\b(hola|buenas|buenos días|buenos dias)\b/.test(t));
}

function mediosPagoTexto() {
  const nequi = process.env.NEQUI_NUMERO || '';
  const banco = process.env.BANCO_CUENTA || '';
  const esPlaceholder = (v) => !v || /CUENTA_|NÚMERO_/i.test(v);
  if (nequi && !esPlaceholder(nequi)) {
    return banco && !esPlaceholder(banco)
      ? `Nequi ${nequi} o Bancolombia ${banco}`
      : `Nequi ${nequi}`;
  }
  if (banco && !esPlaceholder(banco)) return `Bancolombia ${banco}`;
  return '';
}

function humanizarRespuesta(texto) {
  let t = limpiarRespuesta(texto);
  t = t.replace(/CUENTA_BANCOLOMBIA|NÚMERO_NEQUI/gi, '');
  t = t.replace(/o Bancolombia:\s*[\s\n]*/gi, '');
  t = t.replace(/Me has proporcionado la información necesaria\.?\s*/gi, '');
  t = t.replace(/Para confirmar la reserva, debes realizar el anticipo/gi, 'Para separar las fechas falta el anticipo');
  t = t.replace(/^¡?\s*Genial!\s*[🌿💰📅✨]*\s*/gim, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function limpiarRespuesta(texto) {
  if (!texto) return '';
  let t = texto;
  t = t.replace(/Crea_reserva\s*\{[\s\S]*?\}/gi, '');
  t = t.replace(/(?:verificar_disponibilidad|crear_reserva)\s*[\(\{][\s\S]*?[\)\}]/gi, '');
  t = t.replace(/(?:verificar_disponibilidad|crear_reserva)\s*\{[\s\S]*?\}/gi, '');
  t = t.replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, '');
  t = t.replace(/\{[^{}]*"id_reserva"[^{}]*\}/gi, '');
  t = t.replace(/\{[^{}]*"fecha_entrada"[^{}]*\}/gi, '');
  t = t.replace(/\{[^{}]*"precio[^"{]*"[^}]*\}/gi, '');
  t = t.replace(/\{[^{}]*"ok"\s*:\s*true[^{}]*\}/gi, '');
  t = t.replace(/"reserva"\s*:\s*\{[^}]*\}/gi, '');
  t = t.replace(/\[Contexto reserva:[^\]]+\]/gi, '');
  t = t.replace(/\bprecio\.(noches|total|anticipo|personas|tarifa[^\s]*)\b/gi, '');
  t = t.replace(/¿[^?\n]*decoraci[oó]n[^?\n]*\?/gi, '');
  t = t.replace(/¿Cuáles son tus gustos[^?\n]*\?/gi, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function respuestaTieneBasuraTecnica(texto) {
  return /verificar_disponibilidad|crear_reserva|Crea_reserva|"id_reserva"|"fecha_entrada"|"fecha_salida"|precio\.|"ok"\s*:\s*true|function=/i.test(texto);
}

function formatearMensajePrereserva(r) {
  const rango = formatRangoFechasCorto(r.fecha_entrada, r.fecha_salida);
  const nequi = process.env.NEQUI_NUMERO || '';
  const esPlaceholder = (v) => !v || /CUENTA_|NÚMERO_/i.test(v);
  const lineaPago = nequi && !esPlaceholder(nequi)
    ? `Puedes realizar el pago a través de Nequi: ${nequi}.`
    : (mediosPagoTexto() ? `Puedes realizar el pago a través de ${mediosPagoTexto()}.` : '');

  return [
    `¡Perfecto, ${r.nombre}! 🌿`,
    `La reserva para el ${rango} está creada con éxito.`,
    `El anticipo del 50% es de ${formatCOP(r.anticipo_cop)}.`,
    lineaPago,
    'Cuando lo hagas, me envías el comprobante por aquí 📲',
  ].filter(Boolean).join('\n');
}

function datosCompletosParaPrereserva(ctx) {
  const cedula = ctx.cedula ? String(ctx.cedula).replace(/\D/g, '') : '';
  return !!(
    ctx.fecha_entrada &&
    ctx.fecha_salida &&
    ctx.nombre?.trim() &&
    cedula.length >= 6 &&
    ctx._fechasVerificadas
  );
}

function sincronizarContextoReserva(ctx, args, waNumber) {
  if (args.fecha_entrada) ctx.fecha_entrada = args.fecha_entrada;
  if (args.fecha_salida) ctx.fecha_salida = args.fecha_salida;
  if (args.nombre) ctx.nombre = args.nombre;
  if (args.cedula) ctx.cedula = String(args.cedula).replace(/\D/g, '');
  if (args.num_personas) ctx.num_personas = args.num_personas;
  if (args.celular) ctx.celular = args.celular;
  if (!ctx.celular) ctx.celular = waNumber;
}

function pareceComprobantePago(texto) {
  return /comprobante|transfer|transfir|pag[ué]|consign|nequi|recibo|voucher|captura/i.test(texto);
}

function formatearCotizacion(ctx) {
  const c = ctx._ultimaCotizacion;
  if (!c) return null;
  const dIn = parseInt(c.fecha_entrada.slice(8, 10), 10);
  const dOut = parseInt(c.fecha_salida.slice(8, 10), 10);
  const lineas = [
    '¡Hay cupo para esas fechas! 🌿',
    `📅 ${c.noches} noche(s), del ${dIn} al ${dOut}`,
  ];
  if ((c.personas || 2) <= 2) {
    lineas.push(`Para 2 personas: ${formatCOP(c.total)} (incluye vino 🍷)`);
  } else {
    lineas.push(`Para ${c.personas} personas: ${formatCOP(c.total)}`);
  }
  lineas.push(`Anticipo para separar: ${formatCOP(c.anticipo)}`);
  lineas.push('¿Seguimos con tu nombre para la reserva?');
  return lineas.join('\n');
}

function aplicarResultadoFuncion(ctx, name, args, result) {
  if (name === 'verificar_disponibilidad' && result.disponible) {
    ctx.fecha_entrada = args.fecha_entrada;
    ctx.fecha_salida = args.fecha_salida;
    ctx.disponible = true;
    ctx._fechasVerificadas = true;
    if (args.num_personas) ctx.num_personas = args.num_personas;
  }
  if (name === 'crear_reserva' && result.ok && result.id_reserva) {
    ctx.id_reserva = result.id_reserva;
    ctx._prereservaRegistrada = true;
  }
}

/**
 * Crea la prereserva en BD y devuelve el mensaje oficial de confirmación.
 * Solo se llama cuando los datos del contexto están completos.
 */
function completarPrereservaYResponder(ctx, waNumber, textoContexto = '') {
  if (ctx.id_reserva) {
    const existente = db.getReserva(ctx.id_reserva);
    if (existente) {
      return { ok: true, id_reserva: existente.id, mensaje: formatearMensajePrereserva(existente) };
    }
  }

  if (!datosCompletosParaPrereserva(ctx)) return null;

  const { fecha_entrada, fecha_salida } = corregirFechasEstadia(
    ajustarAnioReserva(ctx.fecha_entrada),
    ajustarAnioReserva(ctx.fecha_salida),
    textoContexto || ctx._textoContexto || ''
  );
  const nombre = ctx.nombre.trim();
  const cedula = String(ctx.cedula).replace(/\D/g, '');

  if (!fecha_entrada || !fecha_salida || fecha_entrada >= fecha_salida) {
    return { ok: false, error: 'Fechas inválidas' };
  }

  const { disponible, conflictos } = db.verificarDisponibilidad(fecha_entrada, fecha_salida);
  if (!disponible) {
    const dia = conflictos[0]?.dia;
    return {
      ok: false,
      error: 'ocupado',
      mensaje: `Para el ${formatRangoFechasCorto(fecha_entrada, fecha_salida)} ya no tenemos cupo 😔\n¿Te gustaría revisar otra fecha cercana?`,
    };
  }

  const resultado = db.crearReserva({
    nombre,
    cedula,
    celular: ctx.celular || waNumber,
    fecha_entrada,
    fecha_salida,
    num_personas: ctx.num_personas || 2,
    wa_number: waNumber,
  });

  ctx.id_reserva = resultado.id;
  ctx.fecha_entrada = fecha_entrada;
  ctx.fecha_salida = fecha_salida;
  ctx._prereservaRegistrada = true;

  const reserva = db.getReserva(resultado.id);
  console.log(`📋 Prereserva #${resultado.id} en BD (${fecha_entrada} → ${fecha_salida}) WA ${waNumber}`);

  return {
    ok: true,
    id_reserva: resultado.id,
    mensaje: formatearMensajePrereserva(reserva),
  };
}

// Ejecuta la función que Gemini solicitó
function ejecutarFuncion(name, args, waNumber, ctx, textoContexto = '') {
  args = normalizarArgsFechas(args, textoContexto);

  if (name === 'verificar_disponibilidad') {
    if (!args.fecha_entrada || !args.fecha_salida) {
      return { disponible: false, error: 'Fechas inválidas. Usa formato YYYY-MM-DD' };
    }
    const personas = args.num_personas || ctx?.num_personas || 2;
    const { disponible, conflictos } = db.verificarDisponibilidad(args.fecha_entrada, args.fecha_salida);
    if (disponible) {
      const precio = db.calcularPrecio(args.fecha_entrada, args.fecha_salida, personas);
      const result = {
        disponible: true,
        mensaje: `Fechas disponibles: check-in ${formatFecha(args.fecha_entrada)} 3pm, check-out ${formatFecha(args.fecha_salida)} 1pm`,
        regla: `${precio.noches} noche(s). Usa estos montos exactos en tu respuesta.`,
        precio: {
          noches: precio.noches,
          personas: precio.personas,
          tarifa_por_noche: formatCOP(precio.tarifaNoche),
          total: formatCOP(precio.total),
          anticipo: formatCOP(precio.anticipo),
        },
      };
      if (ctx) {
        ctx._ultimaCotizacion = {
          fecha_entrada: args.fecha_entrada,
          fecha_salida: args.fecha_salida,
          personas: precio.personas,
          noches: precio.noches,
          total: precio.total,
          anticipo: precio.anticipo,
        };
        ctx._fechasVerificadas = true;
        aplicarResultadoFuncion(ctx, name, { ...args, num_personas: personas }, result);
      }
      return result;
    }
    if (ctx) ctx._fechasVerificadas = false;
    return {
      disponible: false,
      mensaje: 'Esas fechas no están disponibles',
      dias_conflicto: conflictos.map(c => c.dia),
    };
  }

  if (name === 'crear_reserva') {
    sincronizarContextoReserva(ctx, args, waNumber);
    return {
      ok: true,
      pendiente_mensaje: true,
      mensaje: 'Datos de reserva guardados. El sistema enviará la confirmación al cliente.',
    };
  }

  return { error: `Función desconocida: ${name}` };
}

async function procesarMensaje(waNumber, texto) {
  db.guardarMensaje(waNumber, 'entrante', texto);

  const mensajesEntrantes = db.getMensajes(waNumber, 50).filter(m => m.direccion === 'entrante');
  if (mensajesEntrantes.length === 1 && esSaludo(texto)) {
    db.guardarMensaje(waNumber, 'saliente', MENSAJE_BIENVENIDA);
    db.upsertConversacion(waNumber, 'activa', {});
    return MENSAJE_BIENVENIDA;
  }

  let conv = db.getConversacion(waNumber);
  const ctx = { ...(conv?.context || {}) };
  actualizarContextoDesdeMensaje(ctx, texto, waNumber);

  const historialTexto = db.getMensajes(waNumber, 20).map(m => m.contenido).join(' ');
  ctx._textoContexto = historialTexto + ' ' + texto;

  if (!ctx.fecha_entrada) {
    const rango = parsearRangoFechas(historialTexto);
    if (rango) Object.assign(ctx, rango);
  }

  if (ctx.fecha_entrada && ctx.fecha_salida) {
    const corregidas = corregirFechasEstadia(ctx.fecha_entrada, ctx.fecha_salida, ctx._textoContexto);
    ctx.fecha_entrada = ajustarAnioReserva(corregidas.fecha_entrada);
    ctx.fecha_salida = ajustarAnioReserva(corregidas.fecha_salida);
    if (!ctx._fechasVerificadas) {
      const { disponible } = db.verificarDisponibilidad(ctx.fecha_entrada, ctx.fecha_salida);
      ctx._fechasVerificadas = disponible;
      if (disponible) {
        const precio = db.calcularPrecio(ctx.fecha_entrada, ctx.fecha_salida, ctx.num_personas || 2);
        ctx._ultimaCotizacion = {
          fecha_entrada: ctx.fecha_entrada,
          fecha_salida: ctx.fecha_salida,
          personas: precio.personas,
          noches: precio.noches,
          total: precio.total,
          anticipo: precio.anticipo,
        };
      }
    }
  }

  const historial = db.getMensajes(waNumber, 30);
  const messages = historial.map(m => ({
    role: m.direccion === 'entrante' ? 'user' : 'assistant',
    content: m.contenido,
  }));

  if (!messages.length || messages[messages.length - 1].content !== texto) {
    messages.push({ role: 'user', content: texto });
  }

  const contextHint = ctx.fecha_entrada
    ? `\n\n[Contexto reserva: entrada=${ctx.fecha_entrada}, salida=${ctx.fecha_salida}, personas=${ctx.num_personas || '?'}, nombre=${ctx.nombre || '?'}, cedula=${ctx.cedula || '?'}, id_reserva=${ctx.id_reserva || 'ninguna'}]`
    : '';
  const systemPrompt = SYSTEM_PROMPT + contextHint;

  try {
    let respuesta = await ai.chat({
      systemPrompt,
      messages,
      tools: GEMINI_TOOLS,
    });

    let maxIter = 5;
    while (respuesta.type === 'function_call' && maxIter-- > 0) {
      const fnResult = ejecutarFuncion(respuesta.name, respuesta.args, waNumber, ctx, ctx._textoContexto);
      respuesta = await ai.sendFunctionResult({
        session: respuesta._session,
        functionName: respuesta.name,
        result: fnResult,
      });
    }

    let textoRespuesta = '';

    // Prereserva en BD + mensaje oficial solo cuando los datos están completos
    const registro = !ctx.id_reserva && datosCompletosParaPrereserva(ctx)
      ? completarPrereservaYResponder(ctx, waNumber, ctx._textoContexto)
      : null;

    if (registro?.ok) {
      textoRespuesta = registro.mensaje;
    } else if (registro?.mensaje) {
      textoRespuesta = registro.mensaje;
    } else {
      textoRespuesta = respuesta.type === 'text' ? respuesta.content : '';
      textoRespuesta = humanizarRespuesta(textoRespuesta);

      const reservaBd = ctx.id_reserva ? db.getReserva(ctx.id_reserva) : null;

      if (pareceComprobantePago(texto) && reservaBd?.estado === 'prereserva') {
        textoRespuesta = `¡Gracias por el comprobante! 🌿\nRecibimos el pago de tu prereserva #${reservaBd.id}.\nLo validamos y te confirmamos en breve ✨`;
      } else if (!textoRespuesta || respuestaTieneBasuraTecnica(textoRespuesta)) {
        if (datosCompletosParaPrereserva(ctx)) {
          const fallback = completarPrereservaYResponder(ctx, waNumber, ctx._textoContexto);
          textoRespuesta = fallback?.mensaje || fallback?.error || '¿Me confirmas otra vez las fechas?';
        } else if (ctx._ultimaCotizacion && !ctx.nombre?.trim()) {
          textoRespuesta = formatearCotizacion(ctx);
        } else if (!ctx._fechasVerificadas && ctx.fecha_entrada) {
          textoRespuesta = `Para el ${formatRangoFechasCorto(ctx.fecha_entrada, ctx.fecha_salida)} ya no hay cupo 😔\n¿Quieres que revise otra fecha?`;
        } else {
          textoRespuesta = '¿En qué más te puedo ayudar? 🌿';
        }
      } else if (reservaBd?.estado === 'prereserva') {
        textoRespuesta = formatearMensajePrereserva(reservaBd);
      } else if (/anticipo recibido|reserva confirmada|está confirmada|creada con éxito/i.test(textoRespuesta)) {
        if (datosCompletosParaPrereserva(ctx)) {
          const fallback = completarPrereservaYResponder(ctx, waNumber, ctx._textoContexto);
          textoRespuesta = fallback?.ok ? fallback.mensaje : (fallback?.mensaje || 'Esas fechas ya no están disponibles 😔');
        } else if (!ctx.id_reserva) {
          textoRespuesta = 'Para separar las fechas necesito confirmar: día de llegada, salida, nombre y cédula 🌿';
          console.warn(`⚠️  IA dijo confirmada sin datos completos para ${waNumber}`);
        }
      }
    }

    if (!textoRespuesta) {
      textoRespuesta = '¿En qué más te puedo ayudar? 🌿';
    }

    db.guardarMensaje(waNumber, 'saliente', textoRespuesta);
    db.upsertConversacion(waNumber, ctx.id_reserva ? 'prereserva' : 'activa', ctx);

    return textoRespuesta;
  } catch (err) {
    console.error('Error en agente:', err.message);

    const registroFallback = datosCompletosParaPrereserva(ctx)
      ? completarPrereservaYResponder(ctx, waNumber, ctx._textoContexto)
      : null;

    let errorMsg = 'Disculpa, estoy teniendo problemas técnicos. Por favor escríbenos en unos minutos 🙏';
    if (registroFallback?.ok) {
      errorMsg = registroFallback.mensaje;
    } else if (registroFallback?.mensaje) {
      errorMsg = registroFallback.mensaje;
    }

    db.guardarMensaje(waNumber, 'saliente', errorMsg);
    db.upsertConversacion(waNumber, ctx.id_reserva ? 'prereserva' : 'activa', ctx);
    return errorMsg;
  }
}

module.exports = { procesarMensaje };
