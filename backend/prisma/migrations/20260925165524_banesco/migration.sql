-- Una misma referencia de un mismo banco es un solo pago. Si por algún motivo
-- quedó repetida, se conserva la copia cobrada (o la más antigua) antes de
-- crear el índice único, para que la migración no falle al desplegar.
CREATE TEMP TABLE pago_duplicado AS
SELECT id FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY banco, referencia
    ORDER BY ("cobradoAt" IS NULL), "createdAt"
  ) AS n
  FROM "PagoRecibido"
  WHERE referencia IS NOT NULL
) t
WHERE n > 1;

DELETE FROM "Conciliacion" WHERE "pagoId" IN (SELECT id FROM pago_duplicado);
DELETE FROM "PagoRecibido" WHERE id IN (SELECT id FROM pago_duplicado);
DROP TABLE pago_duplicado;

-- AlterTable
ALTER TABLE "PagoRecibido" ALTER COLUMN "gmailMessageId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PagoRecibido_banco_referencia_key" ON "PagoRecibido"("banco", "referencia");
