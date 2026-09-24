import { google } from "googleapis";
import { env } from "../env";

export function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    env.gmail.clientId,
    env.gmail.clientSecret,
    env.gmail.redirectUri
  );

  oauth2Client.setCredentials({ refresh_token: env.gmail.refreshToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
