-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('PENDIENTE', 'VERIFICADO', 'SIN_MATCH', 'AMBIGUO', 'ANULADO');

-- CreateTable
CREATE TABLE "PagoRecibido" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "monto" DECIMAL(65,30) NOT NULL,
    "referencia" TEXT,
    "telefonoPagador" TEXT,
    "telefonoReceptor" TEXT,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "fechaCorreo" TIMESTAMP(3) NOT NULL,
    "rawSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoRecibido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoPendiente" (
    "id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "montoEsperado" DECIMAL(65,30) NOT NULL,
    "clienteNombre" TEXT,
    "clienteTelefono" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conciliacion" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "estado" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE',
    "metodoMatch" TEXT,
    "revisadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PagoRecibido_gmailMessageId_key" ON "PagoRecibido"("gmailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Conciliacion_pagoId_key" ON "Conciliacion"("pagoId");

-- CreateIndex
CREATE UNIQUE INDEX "Conciliacion_pedidoId_key" ON "Conciliacion"("pedidoId");

-- AddForeignKey
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoRecibido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conciliacion" ADD CONSTRAINT "Conciliacion_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoPendiente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
