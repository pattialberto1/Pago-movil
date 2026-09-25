-- CreateEnum
CREATE TYPE "EstadoVerificacion" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "PagoRecibido" ADD COLUMN     "verificadoPor" TEXT;

-- CreateTable
CREATE TABLE "SolicitudVerificacion" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "monto" DECIMAL(65,30) NOT NULL,
    "solicitadoPor" TEXT NOT NULL,
    "estado" "EstadoVerificacion" NOT NULL DEFAULT 'PENDIENTE',
    "resueltoPor" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "telegramMensajes" TEXT,
    "pagoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudVerificacion_pkey" PRIMARY KEY ("id")
);

