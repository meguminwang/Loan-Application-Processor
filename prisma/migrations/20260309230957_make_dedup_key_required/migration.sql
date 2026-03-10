/*
  Warnings:

  - Made the column `deduplicationKey` on table `Application` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "loanAmount" REAL NOT NULL,
    "statedMonthlyIncome" REAL NOT NULL,
    "employmentStatus" TEXT NOT NULL,
    "documentedMonthlyIncome" REAL,
    "bankEndingBalance" REAL,
    "bankHasOverdrafts" BOOLEAN,
    "bankHasConsistentDeposits" BOOLEAN,
    "monthlyWithdrawals" REAL,
    "monthlyDeposits" REAL,
    "score" REAL,
    "scoreBreakdown" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "approvedLoanAmount" REAL,
    "deduplicationKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "disbursementQueuedAt" DATETIME
);
INSERT INTO "new_Application" ("applicantName", "approvedLoanAmount", "bankEndingBalance", "bankHasConsistentDeposits", "bankHasOverdrafts", "createdAt", "deduplicationKey", "disbursementQueuedAt", "documentedMonthlyIncome", "email", "employmentStatus", "id", "loanAmount", "monthlyDeposits", "monthlyWithdrawals", "retryCount", "score", "scoreBreakdown", "statedMonthlyIncome", "status", "updatedAt") SELECT "applicantName", "approvedLoanAmount", "bankEndingBalance", "bankHasConsistentDeposits", "bankHasOverdrafts", "createdAt", "deduplicationKey", "disbursementQueuedAt", "documentedMonthlyIncome", "email", "employmentStatus", "id", "loanAmount", "monthlyDeposits", "monthlyWithdrawals", "retryCount", "score", "scoreBreakdown", "statedMonthlyIncome", "status", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_email_loanAmount_createdAt_idx" ON "Application"("email", "loanAmount", "createdAt");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE INDEX "Application_deduplicationKey_createdAt_idx" ON "Application"("deduplicationKey", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
