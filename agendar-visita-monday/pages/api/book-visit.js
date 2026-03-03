// pages/api/book-visit.js
// ElevenLabs Webhook → Monday.com Calendar Integration

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID;

// Column IDs from your Monday.com board (configure in .env)
const COL_EMAIL = process.env.MONDAY_COL_EMAIL || "email";
const COL_DATE = process.env.MONDAY_COL_DATE || "date4";
const COL_HOUR = process.env.MONDAY_COL_HOUR || "hour";
const COL_STATUS = process.env.MONDAY_COL_STATUS || "status";
const COL_NOTES = process.env.MONDAY_COL_NOTES || "text";

// ─── Monday.com GraphQL helper ─────────────────────────────────────────────
async function mondayQuery(query, variables = {}) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_TOKEN,
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ─── Parse ISO 8601 start time ─────────────────────────────────────────────
function parseStart(start) {
  // Accept "2026-03-05T17:00:00" or "2026-03-05T17:00:00+01:00"
  const dt = new Date(start);
  if (isNaN(dt.getTime())) throw new Error("Formato de fecha inválido. Usa ISO 8601: 2026-03-05T17:00:00");

  const dateStr = dt.toISOString().split("T")[0]; // "2026-03-05"
  const hours = String(dt.getHours()).padStart(2, "0");
  const minutes = String(dt.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`; // "17:00"

  const endDt = new Date(dt.getTime() + 60 * 60 * 1000);
  const endHours = String(endDt.getHours()).padStart(2, "0");
  const endMinutes = String(endDt.getMinutes()).padStart(2, "0");
  const endTimeStr = `${endHours}:${endMinutes}`; // "18:00"

  return { dt, dateStr, timeStr, endTimeStr };
}

// ─── Check availability ─────────────────────────────────────────────────────
async function checkAvailability(dateStr, timeStr) {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values(ids: ["${COL_DATE}", "${COL_HOUR}", "${COL_STATUS}"]) {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  const data = await mondayQuery(query, { boardId: MONDAY_BOARD_ID });
  const items = data?.boards?.[0]?.items_page?.items || [];

  // Filter items that match the same date + hour (ignore cancelled ones)
  const conflicts = items.filter((item) => {
    const dateCol = item.column_values.find((c) => c.id === COL_DATE);
    const hourCol = item.column_values.find((c) => c.id === COL_HOUR);
    const statusCol = item.column_values.find((c) => c.id === COL_STATUS);

    const isCancelled =
      statusCol?.text?.toLowerCase().includes("cancelad") ||
      statusCol?.text?.toLowerCase().includes("cancel");

    if (isCancelled) return false;

    const itemDate = dateCol?.text || "";
    const itemHour = hourCol?.text || "";

    return itemDate === dateStr && itemHour === timeStr;
  });

  return conflicts.length === 0;
}

// ─── Create appointment in Monday.com ──────────────────────────────────────
async function createAppointment({ user_name, user_email, dateStr, timeStr, endTimeStr, start }) {
  // Build column_values JSON for Monday.com
  const columnValues = {
    [COL_EMAIL]: { email: user_email, text: user_email },
    [COL_DATE]: { date: dateStr },
    [COL_HOUR]: { hour: parseInt(timeStr.split(":")[0]), minute: parseInt(timeStr.split(":")[1]) },
    [COL_STATUS]: { label: "Confirmada" },
    [COL_NOTES]: `Visita agendada via ElevenLabs AI. Hora fin: ${endTimeStr}`,
  };

  const mutation = `
    mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(
        board_id: $boardId
        item_name: $itemName
        column_values: $columnValues
      ) {
        id
        name
        url: permalink
      }
    }
  `;

  const data = await mondayQuery(mutation, {
    boardId: MONDAY_BOARD_ID,
    itemName: `Visita - ${user_name}`,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item;
}

// ─── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  // Validate env vars
  if (!MONDAY_API_TOKEN || !MONDAY_BOARD_ID) {
    console.error("Faltan variables de entorno: MONDAY_API_TOKEN o MONDAY_BOARD_ID");
    return res.status(500).json({ error: "Configuración del servidor incompleta." });
  }

  const { user_name, user_email, start } = req.body || {};

  // Validate required fields
  if (!user_name || !user_email || !start) {
    return res.status(400).json({
      error: "Faltan campos obligatorios.",
      required: ["user_name", "user_email", "start"],
      received: { user_name: !!user_name, user_email: !!user_email, start: !!start },
    });
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(user_email)) {
    return res.status(400).json({ error: "Email inválido." });
  }

  let parsed;
  try {
    parsed = parseStart(start);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { dateStr, timeStr, endTimeStr } = parsed;

  try {
    // 1. Check availability
    const available = await checkAvailability(dateStr, timeStr);

    if (!available) {
      return res.status(409).json({
        success: false,
        available: false,
        message: `Lo siento, el horario del ${dateStr} a las ${timeStr} no está disponible. Por favor elige otro horario.`,
        date: dateStr,
        time: timeStr,
      });
    }

    // 2. Create appointment
    const item = await createAppointment({
      user_name,
      user_email,
      dateStr,
      timeStr,
      endTimeStr,
      start,
    });

    return res.status(200).json({
      success: true,
      available: true,
      message: `¡Visita confirmada! Hemos agendado tu visita el ${dateStr} de ${timeStr} a ${endTimeStr}. Recibirás confirmación en ${user_email}.`,
      appointment: {
        id: item?.id,
        name: item?.name,
        date: dateStr,
        start_time: timeStr,
        end_time: endTimeStr,
        client: user_name,
        email: user_email,
        monday_url: item?.url || null,
      },
    });
  } catch (err) {
    console.error("Error en book-visit:", err);
    return res.status(500).json({
      success: false,
      error: "Error interno al procesar la reserva.",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
