-- CreateTable
CREATE TABLE "NotificacionPendiente" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificacionPendiente_pkey" PRIMARY KEY ("id")
);

