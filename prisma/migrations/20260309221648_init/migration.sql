-- CreateTable
CREATE TABLE "Application" (
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
    "deduplicationKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "disbursementQueuedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Application_email_loanAmount_createdAt_idx" ON "Application"("email", "loanAmount", "createdAt");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_deduplicationKey_createdAt_idx" ON "Application"("deduplicationKey", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_applicationId_idx" ON "AuditLog"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_transactionId_key" ON "WebhookEvent"("transactionId");

-- CreateIndex
CREATE INDEX "WebhookEvent_applicationId_idx" ON "WebhookEvent"("applicationId");
