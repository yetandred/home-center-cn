-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "indexingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ocrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ocrLanguage" TEXT NOT NULL DEFAULT 'chi_sim+eng',
    "semanticEnabled" BOOLEAN NOT NULL DEFAULT true,
    "embeddingModel" TEXT NOT NULL DEFAULT 'bge-small-en-v1.5',
    "captureParser" TEXT NOT NULL DEFAULT 'BASIC',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DocumentSettings" ("captureParser", "embeddingModel", "id", "indexingEnabled", "ocrEnabled", "semanticEnabled", "updatedAt") SELECT "captureParser", "embeddingModel", "id", "indexingEnabled", "ocrEnabled", "semanticEnabled", "updatedAt" FROM "DocumentSettings";
DROP TABLE "DocumentSettings";
ALTER TABLE "new_DocumentSettings" RENAME TO "DocumentSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
