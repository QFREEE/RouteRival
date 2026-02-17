-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    CONSTRAINT "Node_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "originLat" REAL NOT NULL,
    "originLng" REAL NOT NULL,
    "destLat" REAL NOT NULL,
    "destLng" REAL NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Challenge_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "totalTimeMinutes" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE INDEX "Node_cityId_type_idx" ON "Node"("cityId", "type");

-- CreateIndex
CREATE INDEX "Node_cityId_name_idx" ON "Node"("cityId", "name");

-- CreateIndex
CREATE INDEX "Challenge_dateKey_idx" ON "Challenge"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_cityId_dateKey_key" ON "Challenge"("cityId", "dateKey");

-- CreateIndex
CREATE INDEX "Submission_challengeId_totalTimeMinutes_createdAt_idx" ON "Submission"("challengeId", "totalTimeMinutes", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_challengeId_createdAt_idx" ON "Submission"("challengeId", "createdAt");
