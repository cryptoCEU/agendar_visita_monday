# 🗓️ Agendar Visita — Monday.com × ElevenLabs

Webhook API que conecta tu **agente de voz ElevenLabs** con **Monday.com** para comprobar disponibilidad y agendar visitas de 1 hora automáticamente.

---

## ✅ Qué hace

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/book-visit` | POST | Comprueba disponibilidad **y** agenda la visita |
| `/api/check-availability` | GET / POST | Solo comprueba disponibilidad (sin agendar) |
| `/api/health` | GET | Diagnóstico: configuración + columnas del tablero |

---

## 🚀 Despliegue paso a paso

### 1. Preparar Monday.com

1. Crea un **tablero nuevo** en Monday.com llamado `Visitas` (o usa uno existente)
2. Añade estas columnas:
   - **Email** → tipo `Email`
   - **Fecha** → tipo `Date`
   - **Hora** → tipo `Hour` *(si no existe, usa `Time`)*
   - **Estado** → tipo `Status` con opción `Confirmada` y `Cancelada`
   - **Notas** → tipo `Text`
3. Anota el **ID del tablero** desde la URL: `monday.com/boards/XXXXXXXXXX`
4. Obtén tu **API Token**: Avatar (esquina superior derecha) → `Admin` → `API`

---

### 2. Subir a GitHub

```bash
# En tu terminal local:
git clone https://github.com/TU_USUARIO/agendar-visita-monday
# O crea un nuevo repo y sube estos archivos

git init
git add .
git commit -m "Initial commit: Monday.com booking webhook"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/agendar-visita-monday.git
git push -u origin main
```

---

### 3. Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com) → **Add New Project**
2. Importa tu repo de GitHub
3. En **Environment Variables**, añade:

```
MONDAY_API_TOKEN     = tu_token_aqui
MONDAY_BOARD_ID      = 1234567890
```

4. Haz clic en **Deploy**
5. Visita `https://TU-APP.vercel.app/api/health` para ver las columnas de tu tablero

---

### 4. Configurar IDs de columnas

Después de desplegar, abre `/api/health` en tu navegador. Verás algo como:

```json
{
  "board": {
    "columns": [
      { "id": "email", "title": "Email", "type": "email" },
      { "id": "date4", "title": "Fecha", "type": "date" },
      { "id": "hour", "title": "Hora", "type": "hour" },
      { "id": "status", "title": "Estado", "type": "color" },
      { "id": "text", "title": "Notas", "type": "text" }
    ]
  }
}
```

Añade en Vercel → Environment Variables los IDs reales:

```
MONDAY_COL_EMAIL    = email
MONDAY_COL_DATE     = date4
MONDAY_COL_HOUR     = hour
MONDAY_COL_STATUS   = status
MONDAY_COL_NOTES    = text
```

**Redeploy** después de añadir las variables.

---

## 🧪 Probar en Postman

### POST `/api/book-visit` — Agendar visita

```
POST https://TU-APP.vercel.app/api/book-visit
Content-Type: application/json

{
  "user_name": "José García",
  "user_email": "jose@empresa.com",
  "start": "2026-03-10T17:00:00"
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "available": true,
  "message": "¡Visita confirmada! Hemos agendado tu visita el 2026-03-10 de 17:00 a 18:00...",
  "appointment": {
    "id": "1234567890",
    "date": "2026-03-10",
    "start_time": "17:00",
    "end_time": "18:00",
    "client": "José García",
    "email": "jose@empresa.com"
  }
}
```

**Respuesta no disponible (409):**
```json
{
  "success": false,
  "available": false,
  "message": "Lo siento, el horario del 2026-03-10 a las 17:00 no está disponible..."
}
```

---

### GET `/api/check-availability` — Solo comprobar

```
GET https://TU-APP.vercel.app/api/check-availability?start=2026-03-10T17:00:00
```

O con fecha y hora separadas:
```
GET https://TU-APP.vercel.app/api/check-availability?date=2026-03-10&time=17:00
```

---

### GET `/api/health` — Diagnóstico

```
GET https://TU-APP.vercel.app/api/health
```

---

## 🤖 Configurar en ElevenLabs

Sustituye la tool `book_visit_google_calendar` por esta configuración:

```json
{
  "type": "webhook",
  "name": "book_visit_monday",
  "description": "Comprueba disponibilidad Monday.com y agenda visitas de 1h. End auto calculado desde start +60min",
  "api_schema": {
    "url": "https://TU-APP.vercel.app/api/book-visit",
    "method": "POST",
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "properties": [
        {
          "id": "user_name",
          "type": "string",
          "description": "Nombre completo del cliente. Ej: José García",
          "required": true
        },
        {
          "id": "user_email",
          "type": "string",
          "description": "Email del cliente para confirmación",
          "required": true
        },
        {
          "id": "start",
          "type": "string",
          "description": "Fecha/hora inicio ISO 8601. Ej: 2026-03-05T17:00:00",
          "required": true
        }
      ]
    }
  }
}
```

---

## 📁 Estructura del proyecto

```
agendar-visita-monday/
├── pages/
│   └── api/
│       ├── book-visit.js          # Endpoint principal (ElevenLabs → Monday)
│       ├── check-availability.js  # Solo comprueba disponibilidad
│       └── health.js              # Diagnóstico y columnas del board
├── .env.example                   # Plantilla de variables de entorno
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

---

## ❓ Solución de problemas

| Error | Solución |
|---|---|
| `Configuración del servidor incompleta` | Falta `MONDAY_API_TOKEN` o `MONDAY_BOARD_ID` en Vercel |
| `Monday API HTTP 401` | Token incorrecto o caducado |
| `Monday API HTTP 400` | IDs de columnas incorrectos — usa `/api/health` para verificarlos |
| Visita creada pero sin fecha/hora | Los IDs de columna `MONDAY_COL_DATE` / `MONDAY_COL_HOUR` no son correctos |
| Siempre devuelve disponible | Revisar IDs de columnas en `/api/health` |
