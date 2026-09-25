import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  appPassword: required("APP_PASSWORD"),
  // Clave del teléfono que reenvía las notificaciones de Banesco; sin ella esa entrada queda desactivada.
  ingestToken: process.env.INGEST_TOKEN ?? "",
  telegram: {
    // Sin token el bot queda apagado; sin chats no se pueden pedir verificaciones.
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatIds: (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    apiUrl: process.env.TELEGRAM_API_URL ?? "https://api.telegram.org",
  },
  gmail: {
    clientId: required("GMAIL_CLIENT_ID"),
    clientSecret: required("GMAIL_CLIENT_SECRET"),
    refreshToken: required("GMAIL_REFRESH_TOKEN"),
    redirectUri: process.env.GMAIL_REDIRECT_URI ?? "http://localhost:3456",
    // Correo/remitente del banco que envía las notificaciones de pago móvil.
    bankSenderFilter: required("BANK_SENDER_EMAIL"),
  },
  pollIntervalCron: process.env.POLL_INTERVAL_CRON ?? "*/2 * * * *",
};
