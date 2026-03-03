// pages/api/book-visit.js
// ElevenLabs Webhook → Monday.com (columna datetime única)

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID;

const COL_EMAIL    = process.env.MONDAY_COL_EMAIL    || "email";
const COL_DATETIME = process.env.MONDAY_COL_DATETIME || "date4"; // columna tipo "datetime"
const COL_STATUS   = process.env.MONDAY_COL_STATUS   || "status";
const COL_NOTES    = process.env.MONDAY_COL_NOTES    || "text";

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
  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Monday API error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ─── Parse ISO 8601 ────────────────────────────────────────────────────────
function parseStart(start) {
  const dt = new Date(start);
  if (isNaN(dt.getTime()))
    throw new Error("Formato de fecha inválido. Usa ISO 8601: 2026-03-05T17:00:00");

  const dateStr    = dt.toISOString().split("T")[0];              // "2026-03-05"
  const timeStr    = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`; // "17:00:00"
  const timeDisplay = timeStr.slice(0, 5);                        // "17:00"

  const endDt = new Date(dt.getTime() + 60 * 60 * 1000);
  const endDisplay = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`; // "18:00"

  return { dateStr, timeStr, timeDisplay, endDisplay };
}
const pad = (n) => String(n).padStart(2, "0");

// ─── Check availability ────────────────────────────────────────────────────
async function checkAvailability(dateStr, timeStr) {
  const data = await mondayQuery(`
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 500) {
          items {
            column_values(ids: ["${COL_DATETIME}", "${COL_STATUS}"]) { id text value }
          }
        }
      }
    }
  `, { boardId: MONDAY_BOARD_ID });

  const items = data?.boards?.[0]?.items_page?.items || [];

  const conflicts = items.filter((item) => {
    const dtCol     = item.column_values.find((c) => c.id === COL_DATETIME);
    const statusCol = item.column_values.find((c) => c.id === COL_STATUS);

    if (statusCol?.text?.toLowerCase().includes("cancelad")) return false;

    // Monday stores datetime value as JSON: {"date":"2026-03-10","time":"17:00:00"}
    let itemDate = "", itemTime = "";
    try {
      const v = JSON.parse(dtCol?.value || "{}");
      itemDate = v.date  || "";
      itemTime = v.time  || "";
    } catch {
      const parts = (dtCol?.text || "").split(" ");
      itemDate = parts[0] || "";
      itemTime = parts[1] ? `${parts[1]}:00` : "";
    }

    return itemDate === dateStr && itemTime === timeStr;
  });

  return conflicts.length === 0;
}

// ─── Create appointment ────────────────────────────────────────────────────
async function createAppointment({ user_name, user_email, dateStr, timeStr, endDisplay }) {
  const columnValues = {
    [COL_EMAIL]:    { email: user_email, text: user_email },
    // Monday datetime column format: { "date": "YYYY-MM-DD", "time": "HH:MM:SS" }
    [COL_DATETIME]: { date: dateStr, time: timeStr },
    [COL_STATUS]:   { label: "Confirmada" },
    [COL_NOTES]:    `Visita agendada via ElevenLabs AI. Hora fin estimada: ${endDisplay}`,
  };

  const data = await mondayQuery(`
    mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
        name
        url: permalink
      }
    }
  `, {
    boardId: MONDAY_BOARD_ID,
    itemName: `Visita - ${user_name}`,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item;
}

// ─── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Usa POST" });

  if (!MONDAY_API_TOKEN || !MONDAY_BOARD_ID)
    return res.status(500).json({ error: "Faltan variables: MONDAY_API_TOKEN o MONDAY_BOARD_ID" });

  const { user_name, user_email, start } = req.body || {};

  if (!user_name || !user_email || !start)
    return res.status(400).json({
      error: "Faltan campos obligatorios.",
      required: ["user_name", "user_email", "start"],
    });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email))
    return res.status(400).json({ error: "Email inválido." });

  let parsed;
  try { parsed = parseStart(start); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const { dateStr, timeStr, timeDisplay, endDisplay } = parsed;

  try {
    const available = await checkAvailability(dateStr, timeStr);

    if (!available) {
      return res.status(409).json({
        success: false,
        available: false,
        message: `Lo siento, el ${dateStr} a las ${timeDisplay} no está disponible. Por favor elige otro horario.`,
      });
    }

    const item = await createAppointment({ user_name, user_email, dateStr, timeStr, endDisplay });

    return res.status(200).json({
      success: true,
      available: true,
      message: `¡Visita confirmada! Agendada el ${dateStr} de ${timeDisplay} a ${endDisplay}. Confirmación enviada a ${user_email}.`,
      appointment: {
        id: item?.id,
        date: dateStr,
        start_time: timeDisplay,
        end_time: endDisplay,
        client: user_name,
        email: user_email,
        monday_url: item?.url || null,
      },
    });
  } catch (err) {
    console.error("Error en book-visit:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
