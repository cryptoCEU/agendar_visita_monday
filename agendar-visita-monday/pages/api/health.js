// pages/api/health.js
// Comprueba configuración y devuelve columnas del board Monday.com

const MONDAY_API_URL = "https://api.monday.com/v2";

export default async function handler(req, res) {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  const config = {
    MONDAY_API_TOKEN: token ? "✅ Configurado" : "❌ FALTA",
    MONDAY_BOARD_ID: boardId ? `✅ ${boardId}` : "❌ FALTA",
    MONDAY_COL_EMAIL: process.env.MONDAY_COL_EMAIL || "email (default)",
    MONDAY_COL_DATE: process.env.MONDAY_COL_DATE || "date4 (default)",
    MONDAY_COL_HOUR: process.env.MONDAY_COL_HOUR || "hour (default)",
    MONDAY_COL_STATUS: process.env.MONDAY_COL_STATUS || "status (default)",
    MONDAY_COL_NOTES: process.env.MONDAY_COL_NOTES || "text (default)",
  };

  if (!token || !boardId) {
    return res.status(200).json({
      status: "⚠️ Configuración incompleta",
      config,
      instructions: "Configura las variables de entorno en Vercel y vuelve a intentarlo.",
    });
  }

  // Fetch board columns to help user configure column IDs
  try {
    const response = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({
        query: `
          query ($boardId: ID!) {
            boards(ids: [$boardId]) {
              name
              columns {
                id
                title
                type
              }
            }
          }
        `,
        variables: { boardId },
      }),
    });

    const json = await response.json();
    const board = json?.data?.boards?.[0];

    return res.status(200).json({
      status: "✅ OK",
      config,
      board: {
        name: board?.name,
        columns: board?.columns || [],
        hint: "Usa los 'id' de las columnas como valores en tus variables de entorno MONDAY_COL_*",
      },
    });
  } catch (err) {
    return res.status(200).json({
      status: "⚠️ Error conectando con Monday.com",
      config,
      error: err.message,
    });
  }
}
