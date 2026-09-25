import { env } from "./env";

type Boton = { text: string; callback_data: string };

export interface CallbackQuery {
  id: string;
  from: { id: number; first_name?: string };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
}

interface Update {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: CallbackQuery;
}

export const telegramActivo = () => !!env.telegram.token && env.telegram.chatIds.length > 0;

async function llamar<T>(metodo: string, params: object): Promise<T> {
  const res = await fetch(`${env.telegram.apiUrl}/bot${env.telegram.token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${metodo}: ${data.description ?? res.status}`);
  return data.result;
}

export async function enviarATodos(texto: string, botones: Boton[]) {
  const enviados: { chatId: string; messageId: number }[] = [];
  for (const chatId of env.telegram.chatIds) {
    try {
      const msg = await llamar<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text: texto,
        reply_markup: { inline_keyboard: [botones] },
      });
      enviados.push({ chatId, messageId: msg.message_id });
    } catch (err) {
      console.error(`No se pudo enviar el mensaje de Telegram al chat ${chatId}:`, err);
    }
  }
  return enviados;
}

export async function editarMensaje(chatId: string, messageId: number, texto: string) {
  await llamar("editMessageText", { chat_id: chatId, message_id: messageId, text: texto }).catch((err) =>
    console.error("No se pudo editar el mensaje de Telegram:", err)
  );
}

export async function responderBoton(callbackId: string, texto: string) {
  await llamar("answerCallbackQuery", { callback_query_id: callbackId, text: texto }).catch(() => {});
}

// Long polling: no requiere configurar webhooks y funciona con un solo servicio en Railway.
export async function iniciarTelegram(onBoton: (cb: CallbackQuery) => Promise<void>) {
  if (!env.telegram.token) return;
  let offset = 0;
  console.log("Bot de Telegram activo");

  for (;;) {
    try {
      const updates = await llamar<Update[]>("getUpdates", {
        offset,
        timeout: 50,
        allowed_updates: ["message", "callback_query"],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.callback_query) {
          await onBoton(u.callback_query).catch((err) => console.error("Error procesando botón de Telegram:", err));
        } else if (u.message) {
          // Sirve para que el dueño averigüe su TELEGRAM_CHAT_ID al escribirle al bot.
          await llamar("sendMessage", {
            chat_id: u.message.chat.id,
            text: `Tu ID de chat es ${u.message.chat.id}. Colócalo en Railway en la variable TELEGRAM_CHAT_ID para recibir las verificaciones.`,
          }).catch(() => {});
        }
      }
    } catch (err) {
      // 409 al desplegar (dos instancias a la vez) o cortes de red: reintentar.
      console.error("Error consultando Telegram, reintentando:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
