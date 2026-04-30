# Cabaña Risaralda — Sistema de Reservas

Sistema completo de reservas con agente de WhatsApp con IA, calendario interactivo y panel de administración.

## Stack

- **Backend**: Node.js 18+, Express, better-sqlite3
- **IA**: Google Gemini Flash (gratis) + Groq como fallback
- **WhatsApp**: API oficial de Meta (WhatsApp Business)
- **Recordatorios**: node-cron
- **Frontend**: HTML/CSS/JS vanilla (sin frameworks)

## Requisitos

- Node.js 18 o superior
- Cuenta en Google AI Studio (para Gemini — gratis)
- Cuenta en Groq (fallback — gratis)
- WhatsApp Business API (Meta Developers)

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar y configurar variables de entorno
cp .env.example .env
# → Editar .env con tus keys

# 3. Iniciar el servidor
npm start          # producción
npm run dev        # desarrollo con hot-reload (nodemon)
```

## Configuración del .env

| Variable | Descripción | Cómo obtenerla |
|---|---|---|
| `GEMINI_API_KEY` | API key de Gemini | https://aistudio.google.com/app/apikey (gratis) |
| `GROQ_API_KEY` | API key de Groq (fallback) | https://console.groq.com/keys (gratis) |
| `WHATSAPP_TOKEN` | Token de acceso Meta | https://developers.facebook.com/apps |
| `WHATSAPP_PHONE_ID` | ID del número de WhatsApp | Meta Developers → WhatsApp → Configuración API |
| `VERIFY_TOKEN` | Token de verificación webhook | Cualquier string secreto que elijas |
| `NEQUI_NUMERO` | Número Nequi para pagos | Tu número (ej. `57300XXXXXXX`) |
| `BANCO_CUENTA` | Cuenta Bancolombia | Tu número de cuenta |
| `NUMERO_WA` | Número WhatsApp de la cabaña | Formato internacional: `57300XXXXXXX` |
| `ADMIN_USER` | Usuario panel admin | Elige uno (ej. `admin`) |
| `ADMIN_PASS` | Contraseña panel admin | Elige una contraseña segura |

## Uso

### Página pública (clientes)
```
http://localhost:3000/
```
Los clientes pueden consultar disponibilidad, ver precios y generar un mensaje de WhatsApp.

### Panel de administración
```
http://localhost:3000/admin.html
```
Login con `ADMIN_USER` / `ADMIN_PASS`. Permite:
- Ver calendario con estados de todos los días
- Crear, confirmar, cancelar y completar reservas
- Bloquear/desbloquear rangos de fechas (mantenimiento, uso personal, etc.)
- Ver métricas del mes (noches ocupadas, ingresos, pendientes)

### API REST
```
GET  /api/disponibilidad?year=2025&month=5
GET  /api/disponibilidad/verificar?entrada=2025-05-10&salida=2025-05-12
GET  /api/reservas
POST /api/reservas
...
```

## Desarrollo con ngrok (webhook local)

Para recibir mensajes de WhatsApp en local:

```bash
# 1. Instalar ngrok: https://ngrok.com/download
# 2. En una terminal separada:
ngrok http 3000

# 3. Copiar la URL HTTPS que genera ngrok (ej. https://abc123.ngrok.io)
# 4. En Meta Developers → WhatsApp → Configuración → URL de webhook:
#    https://abc123.ngrok.io/webhook
# 5. Token de verificación: el valor de VERIFY_TOKEN en tu .env
```

## Deploy gratuito en Railway

1. Subir el proyecto a GitHub (asegúrate de que `.env` está en `.gitignore`)
2. Ir a https://railway.app → New Project → Deploy from GitHub
3. Seleccionar el repositorio
4. En Variables: agregar todas las variables del `.env`
5. Railway detecta automáticamente Node.js y ejecuta `npm start`
6. Una vez desplegado, copiar la URL pública y configurarla como webhook en Meta

## Lógica de horarios (importante)

- **Check-in**: 3:00 PM del día de llegada
- **Check-out**: 1:00 PM del día de salida
- **Una noche** = entrada día X (3pm) → salida día X+1 (1pm)

### Regla de mismo día permitida

Si un huésped hace checkout el día 10 (1pm), **otro puede hacer check-in ese mismo día 10 (3pm)**. El sistema lo permite correctamente porque la condición de ocupado es:

```
fecha_entrada <= día < fecha_salida
```

El día de salida (`fecha_salida`) **no** cuenta como ocupado para la reserva existente, por lo que nuevas reservas con `fecha_entrada` igual al `fecha_salida` de otra son válidas.

## Recordatorios automáticos

El scheduler corre cada hora y:
1. **24h antes del check-in**: envía WhatsApp con instrucciones de llegada
2. **24h después del checkout**: envía WhatsApp solicitando reseña en Google Maps
3. **Limpieza**: elimina conversaciones inactivas (+48h)
4. **Auto-completar**: marca como "completadas" las reservas con checkout del día anterior

## Estructura del proyecto

```
cabaña-agente/
├── server.js           ← Express app principal
├── src/
│   ├── database.js     ← SQLite: tablas, queries, helpers
│   ├── agent.js        ← Agente IA: flujo de conversación WhatsApp
│   ├── ai.js           ← Gemini + Groq fallback
│   ├── whatsapp.js     ← Envío de mensajes Meta API
│   ├── scheduler.js    ← Recordatorios con node-cron
│   └── utils.js        ← Fechas, precios, validaciones
├── routes/
│   ├── disponibilidad.js
│   ├── reservas.js
│   ├── bloqueos.js
│   └── admin.js
├── public/
│   ├── index.html      ← Página pública (clientes)
│   ├── admin.html      ← Panel admin (protegido)
│   ├── css/style.css
│   └── js/
│       ├── calendario.js   ← Clase Calendario reutilizable
│       ├── admin.js
│       └── cliente.js
└── data/
    └── reservas.db     ← Base de datos SQLite (auto-creada)
```
