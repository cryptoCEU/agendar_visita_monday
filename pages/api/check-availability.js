// pages/api/check-availability.js
// Solo comprueba disponibilidad (sin agendar) — columna datetime única

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID  = process.env.MONDAY_BOARD_ID;
const COL_DATETIME     = process.env.MONDAY_COL_DATETIME || "date4";
const COL_STATUS       = process.env.MONDAY_COL_STATUS   || "status";

const pad = (n) => String(n).padStart(2, "0");

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST")
    return res.status(405).json({ error: "Usa GET o POST" });

  const params = req.method === "GET" ? req.query : req.body;
  const { start } = params;

  if (!start)
    return res.status(400).json({ error: "Proporciona 'start' en formato ISO 8601. Ej: 2026-03-10T17:00:00" });

  const dt = new Date(start);
  if (isNaN(dt.getTime()))
    return res.status(400).json({ error: "Fecha inválida. Usa ISO 8601." });

  const dateStr = dt.toISOString().split("T")[0];
  const timeStr = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
  const timeDisplay = timeStr.slice(0, 5);

  try {
    const res2 = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MONDAY_API_TOKEN,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({
        query: `
          query ($boardId: ID!) {
            boards(ids: [$boardId]) {
              items_page(limit: 500) {
                items {
                  column_values(ids: ["${COL_DATETIME}", "${COL_STATUS}"]) { id text value }
                }
              }
            }
          }
        `,
        variables: { boardId: MONDAY_BOARD_ID },
      }),
    });

    const json = await res2.json();
    const items = json?.data?.boards?.[0]?.items_page?.items || [];

    const conflicts = items.filter((item) => {
      const dtCol     = item.column_values.find((c) => c.id === COL_DATETIME);
      const statusCol = item.column_values.find((c) => c.id === COL_STATUS);
      if (statusCol?.text?.toLowerCase().includes("cancelad")) return false;
      let itemDate = "", itemTime = "";
      try {
        const v = JSON.parse(dtCol?.value || "{}");
        itemDate = v.date || "";
        itemTime = v.time || "";
      } catch {
        const parts = (dtCol?.text || "").split(" ");
        itemDate = parts[0] || "";
        itemTime = parts[1] ? `${parts[1]}:00` : "";
      }
      return itemDate === dateStr && itemTime === timeStr;
    });

    const available = conflicts.length === 0;
    return res.status(200).json({
      available,
      date: dateStr,
      time: timeDisplay,
      message: available
        ? `El ${dateStr} a las ${timeDisplay} está disponible.`
        : `El ${dateStr} a las ${timeDisplay} NO está disponible (${conflicts.length} reserva/s existente/s).`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
