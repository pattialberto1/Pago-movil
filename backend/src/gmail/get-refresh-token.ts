/**
 * Script de un solo uso para obtener GMAIL_REFRESH_TOKEN.
 * Ejecutar en tu computadora (necesita abrir el navegador):
 *   npx tsx src/gmail/get-refresh-token.ts
 */
import "dotenv/config";
import http from "node:http";
import { google } from "googleapis";

const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}`;

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Define GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en backend/.env primero");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
});

// Uso remoto: si el navegador no alcanza este equipo, se pasa como argumento
// la URL a la que Google redirigió (http://localhost:3456/?code=...).
const pegado = process.argv[2];
if (pegado) {
  const code = pegado.startsWith("http") ? new URL(pegado).searchParams.get("code") : pegado;
  oauth2Client
    .getToken(code ?? "")
    .then(({ tokens }) => console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`))
    .catch((err) => {
      console.error(err.response?.data ?? err);
      process.exit(1);
    });
} else {
  startServer();
}

function startServer() {
const server = http.createServer(async (req, res) => {
  const code = new URL(req.url ?? "/", REDIRECT_URI).searchParams.get("code");
  if (!code) {
    res.end("Falta el código de autorización.");
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.end("Listo. Vuelve a la terminal y copia el token.");
    console.log(`\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    res.end("Error obteniendo el token, revisa la terminal.");
    console.error(err);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("\nAbre esta URL en el navegador e inicia sesión con el correo que recibe las notificaciones:\n");
  console.log(authUrl, "\n");
});
}
