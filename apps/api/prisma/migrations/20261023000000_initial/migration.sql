CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Session" (
  "id" UUID NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "userId" UUID NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "Plant" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "name" TEXT NOT NULL,
  "species" TEXT NOT NULL DEFAULT '', "room" TEXT NOT NULL DEFAULT '', "note" TEXT NOT NULL DEFAULT '',
  "intervalDays" INTEGER NOT NULL DEFAULT 7, "icon" TEXT NOT NULL DEFAULT 'monstera',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Plant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Plant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Plant_intervalDays_check" CHECK ("intervalDays" BETWEEN 1 AND 365)
);
CREATE INDEX "Plant_userId_createdAt_idx" ON "Plant"("userId", "createdAt");
CREATE TABLE "WateringEvent" (
  "id" UUID NOT NULL, "plantId" UUID NOT NULL,
  "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "requestId" UUID NOT NULL,
  CONSTRAINT "WateringEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WateringEvent_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WateringEvent_plantId_requestId_key" ON "WateringEvent"("plantId", "requestId");
CREATE INDEX "WateringEvent_plantId_happenedAt_idx" ON "WateringEvent"("plantId", "happenedAt");
CREATE TABLE "PageViewCounter" (
  "route" TEXT NOT NULL, "total" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "PageViewCounter_pkey" PRIMARY KEY ("route")
);
