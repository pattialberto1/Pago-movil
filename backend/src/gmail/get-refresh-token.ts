/**
 * Script de un solo uso (Fase 0) para obtener el GMAIL_REFRESH_TOKEN.
 *
 * 1. Crea un proyecto en https://console.cloud.google.com/, habilita "Gmail API"
 *    y crea credenciales OAuth 2.0 de tipo "Desktop app". Copia el client id/secret
 *    en el .env como GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET.
 * 2. Ejecuta: npx tsx src/gmail/get-refresh-token.ts
 * 3. Abre la URL que imprime, inicia sesión con el correo de la empresa,
 *    autoriza el scope de solo lectura, y pega el "code" que te da Google.
 * 4. El script imprime el refresh_token: cópialo a GMAIL_REFRESH_TOKEN en .env
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { google } from "googleapis";

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Define GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en backend/.env primero");
  }

  const redirectUri = "urn:ietf:wg:oauth:2.0:oob";
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });

  console.log("\nAbre esta URL, autoriza el acceso con el correo de la empresa, y copia el código:\n");
  console.log(authUrl, "\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await rl.question("Pega aquí el código: ");
  rl.close();

  const { tokens } = await oauth2Client.getToken(code.trim());
  console.log("\nGMAIL_REFRESH_TOKEN=", tokens.refresh_token, "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
