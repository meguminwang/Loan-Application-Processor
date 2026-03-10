import { config } from "../config";

/**
 * Application input for scoring.
 */
export interface ScoringInput {
  statedMonthlyIncome: number;
  documentedMonthlyIncome: number | null;
  loanAmount: number;
  employmentStatus: string;
  bankEndingBalance: number | null;
  bankHasOverdrafts: boolean | null;
  bankHasConsistentDeposits: boolean | null;
  monthlyWithdrawals: number | null;
  monthlyDeposits: number | null;
}

/**
 * Result of a single scoring factor.
 */
export interface FactorResult {
  factor: string;
  score: number;       // 0-100 raw score for this factor
  weight: number;      // Weight from config
  weighted: number;    // score * weight
  details: string;     // Human-readable explanation
}

// Score for missing data: "unknown" → middle score → drives toward manual review
const UNKNOWN_SCORE = 50;

/**
 * Income Verification (30%)
 *
 * Does documented income match stated income within tolerance?
 *
 * Interpretation: documented income must be >= (1 - tolerance) * stated income.
 * - documented >= stated * 0.9 → full score (100)
 * - documented > stated → full score (conservative applicant, not a risk)
 * - documented < stated * 0.9 → proportional score based on how close it is
 * - documented is null → UNKNOWN_SCORE (needs human review, not auto-deny)
 */
export function scoreIncomeVerification(input: ScoringInput): FactorResult {
  const weight = config.scoring.weights.incomeVerification;
  const tolerance = config.scoring.incomeVerificationTolerance;

  if (input.documentedMonthlyIncome === null) {
    return {
      factor: "Income Verification",
      score: UNKNOWN_SCORE,
      weight,
      weighted: UNKNOWN_SCORE * weight,
      details: "No documented income provided — flagging for review",
    };
  }

  const stated = input.statedMonthlyIncome;
  const documented = input.documentedMonthlyIncome;
  const threshold = stated * (1 - tolerance); // e.g., stated * 0.9

  let score: number;
  let details: string;

  if (documented >= threshold) {
    score = 100;
    details = `Documented income ($${documented}) within tolerance of stated ($${stated})`;
  } else {
    // Proportional score: how close is documented to the threshold?
    score = Math.max(0, Math.round((documented / threshold) * 100));
    details = `Documented income ($${documented}) below tolerance of stated ($${stated}). Ratio: ${(documented / stated * 100).toFixed(1)}%`;
  }

  return { factor: "Income Verification", score, weight, weighted: score * weight, details };
}

/**
 * Income Level (25%)
 *
 * Is monthly income >= 3x the requested loan amount?
 * Uses documented income if available, otherwise stated income.
 *
 * Binary scoring: this is a hard affordability gate.
 * Either you can afford the loan or you can't.
 */
export function scoreIncomeLevel(input: ScoringInput): FactorResult {
  const weight = config.scoring.weights.incomeLevel;
  const income = input.documentedMonthlyIncome ?? input.statedMonthlyIncome;
  const required = input.loanAmount * 3;

  const passes = income >= required;
  const score = passes ? 100 : 0;
  const details = passes
    ? `Income ($${income}) >= 3x loan amount ($${input.loanAmount})`
    : `Income ($${income}) < 3x loan amount ($${input.loanAmount}). Needed: $${required}`;

  return { factor: "Income Level", score, weight, weighted: score * weight, details };
}

/**
 * Account Stability (20%)
 *
 * Three sub-factors, each worth 1/3 of this factor's score:
 * - Positive ending balance?
 * - No overdrafts?
 * - Consistent deposits?
 *
 * If all bank data is null, score is UNKNOWN_SCORE (needs review).
 */
export function scoreAccountStability(input: ScoringInput): FactorResult {
  const weight = config.scoring.weights.accountStability;

  // If all bank data is null, no documents provided
  if (
    input.bankEndingBalance === null &&
    input.bankHasOverdrafts === null &&
    input.bankHasConsistentDeposits === null
  ) {
    return {
      factor: "Account Stability",
      score: UNKNOWN_SCORE,
      weight,
      weighted: UNKNOWN_SCORE * weight,
      details: "No bank account data provided — flagging for review",
    };
  }

  let subScore = 0;
  let knownFactors = 0;
  const parts: string[] = [];

  // Positive ending balance
  if (input.bankEndingBalance === null) {
    parts.push("balance unknown");
  } else {
    knownFactors++;
    if (input.bankEndingBalance > 0) {
      subScore++;
      parts.push(`positive balance ($${input.bankEndingBalance})`);
    } else {
      parts.push(`non-positive balance ($${input.bankEndingBalance})`);
    }
  }

  // No overdrafts
  if (input.bankHasOverdrafts === null) {
    parts.push("overdraft status unknown");
  } else {
    knownFactors++;
    if (input.bankHasOverdrafts === false) {
      subScore++;
      parts.push("no overdrafts");
    } else {
      parts.push("has overdrafts");
    }
  }

  // Consistent deposits
  if (input.bankHasConsistentDeposits === null) {
    parts.push("deposit consistency unknown");
  } else {
    knownFactors++;
    if (input.bankHasConsistentDeposits === true) {
      subScore++;
      parts.push("consistent deposits");
    } else {
      parts.push("inconsistent deposits");
    }
  }

  // Score based on ratio of passing factors to known factors
  const score = knownFactors > 0
    ? Math.round((subScore / knownFactors) * 100)
    : UNKNOWN_SCORE;

  return {
    factor: "Account Stability",
    score,
    weight,
    weighted: score * weight,
    details: parts.join(", "),
  };
}

/**
 * Employment Status (15%)
 *
 * employed (100) > self-employed (60) > unemployed (0)
 */
export function scoreEmploymentStatus(input: ScoringInput): FactorResult {
  const weight = config.scoring.weights.employmentStatus;

  const scores: Record<string, number> = {
    employed: 100,
    "self-employed": 60,
    unemployed: 0,
  };

  const score = scores[input.employmentStatus] ?? 0;

  return {
    factor: "Employment Status",
    score,
    weight,
    weighted: score * weight,
    details: `Status: ${input.employmentStatus} (${score}/100)`,
  };
}

/**
 * Debt-to-Income (10%)
 *
 * Ratio of withdrawals to deposits (proxy for existing obligations).
 * Lower ratio = better score.
 *
 * ratio = withdrawals / deposits
 * - ratio <= 0.2 → 100 (very healthy, spending < 20% of income)
 * - ratio >= 0.8 → 0 (spending 80%+ of income, high risk)
 * - In between → linear interpolation
 *
 * Null data → UNKNOWN_SCORE (needs review).
 */
export function scoreDebtToIncome(input: ScoringInput): FactorResult {
  const weight = config.scoring.weights.debtToIncome;

  if (input.monthlyWithdrawals === null || input.monthlyDeposits === null) {
    return {
      factor: "Debt-to-Income",
      score: UNKNOWN_SCORE,
      weight,
      weighted: UNKNOWN_SCORE * weight,
      details: "No withdrawal/deposit data provided — flagging for review",
    };
  }

  if (input.monthlyDeposits === 0) {
    return {
      factor: "Debt-to-Income",
      score: 0,
      weight,
      weighted: 0,
      details: "No deposits (division by zero)",
    };
  }

  const ratio = input.monthlyWithdrawals / input.monthlyDeposits;

  let score: number;
  if (ratio <= 0.2) {
    score = 100;
  } else if (ratio >= 0.8) {
    score = 0;
  } else {
    // Linear interpolation: 0.2 → 100, 0.8 → 0
    score = Math.round(((0.8 - ratio) / (0.8 - 0.2)) * 100);
  }

  return {
    factor: "Debt-to-Income",
    score,
    weight,
    weighted: score * weight,
    details: `Withdrawal/deposit ratio: ${(ratio * 100).toFixed(1)}% ($${input.monthlyWithdrawals}/$${input.monthlyDeposits})`,
  };
}
