const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const qrcode = require('qrcode-terminal');

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

module.exports = { sendMessage, init };
