import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "./env";

const hash = (valor: string) => createHash("sha256").update(valor).digest();

export function claveCorrecta(recibida: string, esperada: string): boolean {
  return !!recibida && !!esperada && timingSafeEqual(hash(recibida), hash(esperada));
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const clave = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (claveCorrecta(clave, env.appPassword)) {
    next();
    return;
  }
  res.status(401).json({ error: "Contraseña incorrecta" });
};
