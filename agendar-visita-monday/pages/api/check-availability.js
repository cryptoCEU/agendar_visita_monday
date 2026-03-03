// pages/api/check-availability.js
// Endpoint auxiliar: solo comprueba disponibilidad sin agendar

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID;

const COL_DATE = process.env.MONDAY_COL_DATE || "date4";
const COL_HOUR = process.env.MONDAY_COL_HOUR || "hour";
const COL_STATUS = process.env.MONDAY_COL_STATUS || "status";

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

  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Usa GET o POST" });
  }

  const { start, date, time } = req.method === "GET" ? req.query : req.body;

  let dateStr, timeStr;

  if (start) {
    const dt = new Date(start);
    if (isNaN(dt.getTime())) return res.status(400).json({ error: "Fecha inválida" });
    dateStr = dt.toISOString().split("T")[0];
    timeStr = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  } else if (date && time) {
    dateStr = date;
    timeStr = time;
  } else {
    return res.status(400).json({ error: "Proporciona 'start' (ISO 8601) o 'date' + 'time'" });
  }

  try {
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
              }
            }
          }
        }
      }
    `;

    const data = await mondayQuery(query, { boardId: MONDAY_BOARD_ID });
    const items = data?.boards?.[0]?.items_page?.items || [];

    const conflicts = items.filter((item) => {
      const dateCol = item.column_values.find((c) => c.id === COL_DATE);
      const hourCol = item.column_values.find((c) => c.id === COL_HOUR);
      const statusCol = item.column_values.find((c) => c.id === COL_STATUS);
      const isCancelled = statusCol?.text?.toLowerCase().includes("cancelad");
      if (isCancelled) return false;
      return dateCol?.text === dateStr && hourCol?.text === timeStr;
    });

    return res.status(200).json({
      available: conflicts.length === 0,
      date: dateStr,
      time: timeStr,
      conflicts: conflicts.length,
      message:
        conflicts.length === 0
          ? `El horario del ${dateStr} a las ${timeStr} está disponible.`
          : `El horario del ${dateStr} a las ${timeStr} NO está disponible (${conflicts.length} reserva/s existente/s).`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
