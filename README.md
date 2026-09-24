# Pago Móvil — Verificación automática

Web app para verificar pagos móviles recibidos por la empresa, leyendo las
notificaciones que el banco envía a un correo de Gmail y conciliándolas
automáticamente contra los pedidos/ventas pendientes.

## Estructura

- `backend/` — API en Node + TypeScript + Express + Prisma (PostgreSQL).
  Incluye el poller que revisa Gmail cada X minutos, el parser del correo
  del banco y el motor de conciliación.
- `frontend/` — Dashboard en React + Vite (listado de pagos, pedidos y
  conciliaciones).

## Estado actual (Fase 0 / Fase 1 en progreso)

- ✅ Esqueleto del backend y frontend.
- ✅ Modelo de datos (Prisma): `PagoRecibido`, `PedidoPendiente`, `Conciliacion`.
- ✅ Integración con Gmail API (OAuth2, solo lectura).
- ✅ Motor de conciliación básico (monto exacto + ventana de tiempo).
- ✅ Parser ajustado al formato real de **Bancaribe** (remitente
  `conexionmipago@bancaribe.com.ve`), extrayendo monto, teléfono pagador,
  teléfono receptor, referencia y fecha/hora exacta de la transacción.

## Setup — Fase 0

### 1. Google Cloud (acceso de solo lectura a Gmail)

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Habilita la **Gmail API** (APIs & Services → Library).
3. Configura la pantalla de consentimiento OAuth (External u Organización interna).
4. Crea credenciales OAuth 2.0 de tipo **Desktop app** → copia el `client_id` y `client_secret`.
5. En `backend/.env` (copia `backend/.env.example`), coloca `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET`.
6. Ejecuta el script de un solo uso para obtener el refresh token:
   ```bash
   cd backend
   npm install
   npx tsx src/gmail/get-refresh-token.ts
   ```
   Sigue las instrucciones en consola (inicia sesión con el correo de la
   empresa) y copia el `GMAIL_REFRESH_TOKEN` resultante al `.env`.
7. Define `BANK_SENDER_EMAIL` con el remitente exacto de las notificaciones del banco.

### 2. Base de datos

Necesitas un PostgreSQL (local con Docker o uno gestionado tipo Neon/Supabase/Railway).

```bash
# Ejemplo local con Docker:
docker run --name pago-movil-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=pago_movil -p 5432:5432 -d postgres:16
```

Coloca la URL en `DATABASE_URL` dentro de `backend/.env`.

### 3. Backend

```bash
cd backend
npm install
npm run prisma:migrate   # crea las tablas
npm run dev              # levanta la API en :4000 + revisa correos cada 2 min
```

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # ajusta VITE_API_URL si hace falta
npm run dev               # dashboard en :5173
```

## Próximo paso

Con las credenciales de Google Cloud y el refresh token generados (paso 1),
levantar el backend apuntando a un buzón real y confirmar en los logs que
los correos de Bancaribe se están parseando y conciliando correctamente.
Si el banco cambia el formato del correo, ajustar las expresiones
regulares en `backend/src/parser/bancoParser.ts`.

## Despliegue recomendado

- **Railway** o **Render**: backend (API + cron de revisión de correo en el
  mismo proceso) + PostgreSQL gestionado, corriendo 24/7 sin depender de
  ninguna computadora encendida.
- **Frontend**: se puede desplegar junto al backend o por separado (Vercel/Netlify),
  apuntando `VITE_API_URL` a la URL pública del backend.
