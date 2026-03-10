import prisma from "../db";
import { config } from "../config";
import { DuplicateApplicationError, ApplicationNotFoundError } from "../errors";
import { ApplicationStatus, transitionTo } from "../state-machine";
import { scoreApplication, type ScoringResult } from "../scoring";

export interface CreateApplicationInput {
  applicant_name: string;
  email: string;
  loan_amount: number;
  stated_monthly_income: number;
  employment_status: string;
  documented_monthly_income: number | null;
  bank_ending_balance: number | null;
  bank_has_overdrafts: boolean | null;
  bank_has_consistent_deposits: boolean | null;
  monthly_withdrawals: number | null;
  monthly_deposits: number | null;
}

/**
 * Creates a new loan application.
 *
 * All steps run inside a single transaction for atomicity:
 * 1. Check for duplicates (same email + loan_amount within dedup window)
 * 2. Create application in "submitted" state
 * 3. Transition to "processing", run scoring engine
 * 4. Transition to final decision state (approved/denied/flagged_for_review)
 * 5. If approved, transition to disbursement_queued
 */
export async function createApplication(input: CreateApplicationInput) {
  const deduplicationKey = `${input.email.toLowerCase()}:${input.loan_amount}`;

  return await prisma.$transaction(async (tx) => {
    // 1. Duplicate detection (inside transaction for atomicity)
    const windowStart = new Date(
      Date.now() - config.deduplication.windowMinutes * 60 * 1000
    );

    const existing = await tx.application.findFirst({
      where: {
        deduplicationKey,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      throw new DuplicateApplicationError(existing.id);
    }

    // 2. Create application
    const application = await tx.application.create({
      data: {
        applicantName: input.applicant_name,
        email: input.email.toLowerCase(),
        loanAmount: input.loan_amount,
        statedMonthlyIncome: input.stated_monthly_income,
        employmentStatus: input.employment_status,
        documentedMonthlyIncome: input.documented_monthly_income,
        bankEndingBalance: input.bank_ending_balance,
        bankHasOverdrafts: input.bank_has_overdrafts,
        bankHasConsistentDeposits: input.bank_has_consistent_deposits,
        monthlyWithdrawals: input.monthly_withdrawals,
        monthlyDeposits: input.monthly_deposits,
        deduplicationKey,
        status: ApplicationStatus.SUBMITTED,
      },
    });

    // Create initial audit log
    await tx.auditLog.create({
      data: {
        applicationId: application.id,
        action: "application_created",
        toStatus: ApplicationStatus.SUBMITTED,
      },
    });

    // 3. Process: submitted → processing
    await transitionTo(application.id, ApplicationStatus.PROCESSING, { tx });

    // 4. Score the application (pure function, no DB)
    const scoringResult: ScoringResult = scoreApplication({
      statedMonthlyIncome: input.stated_monthly_income,
      documentedMonthlyIncome: input.documented_monthly_income,
      loanAmount: input.loan_amount,
      employmentStatus: input.employment_status,
      bankEndingBalance: input.bank_ending_balance,
      bankHasOverdrafts: input.bank_has_overdrafts,
      bankHasConsistentDeposits: input.bank_has_consistent_deposits,
      monthlyWithdrawals: input.monthly_withdrawals,
      monthlyDeposits: input.monthly_deposits,
    });

    // Save score to application
    await tx.application.update({
      where: { id: application.id },
      data: {
        score: scoringResult.totalScore,
        scoreBreakdown: JSON.stringify(scoringResult.factors),
      },
    });

    // 5. Transition to decision state
    const decisionStatus = scoringResult.decision as ApplicationStatus;
    await transitionTo(application.id, decisionStatus, {
      metadata: {
        score: scoringResult.totalScore,
        decision: scoringResult.decision,
      },
      tx,
    });

    // 6. If approved, queue for disbursement
    if (decisionStatus === ApplicationStatus.APPROVED) {
      await transitionTo(application.id, ApplicationStatus.DISBURSEMENT_QUEUED, {
        metadata: { reason: "Auto-approved, queuing disbursement" },
        tx,
      });
      await tx.application.update({
        where: { id: application.id },
        data: { disbursementQueuedAt: new Date() },
      });
    }

    // Return the final state
    const final = await tx.application.findUnique({
      where: { id: application.id },
      include: { auditLogs: { orderBy: { createdAt: "asc" } } },
    });

    return {
      ...final,
      scoreBreakdown: final?.scoreBreakdown
        ? JSON.parse(final.scoreBreakdown)
        : null,
    };
  });
}

/**
 * Get a single application by ID with full details.
 */
export async function getApplication(id: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      auditLogs: { orderBy: { createdAt: "asc" } },
      webhookEvents: { orderBy: { processedAt: "asc" } },
    },
  });

  if (!application) {
    throw new ApplicationNotFoundError(id);
  }

  return {
    ...application,
    scoreBreakdown: application.scoreBreakdown
      ? JSON.parse(application.scoreBreakdown)
      : null,
  };
}
