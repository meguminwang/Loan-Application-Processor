import { config } from "../config";
import {
  ScoringInput,
  FactorResult,
  scoreIncomeVerification,
  scoreIncomeLevel,
  scoreAccountStability,
  scoreEmploymentStatus,
  scoreDebtToIncome,
} from "./factors";

export type Decision = "approved" | "denied" | "flagged_for_review";

export interface ScoringResult {
  totalScore: number;
  decision: Decision;
  factors: FactorResult[];
}

/**
 * Scores an application and returns the total score, decision, and per-factor breakdown.
 */
export function scoreApplication(input: ScoringInput): ScoringResult {
  const factors: FactorResult[] = [
    scoreIncomeVerification(input),
    scoreIncomeLevel(input),
    scoreAccountStability(input),
    scoreEmploymentStatus(input),
    scoreDebtToIncome(input),
  ];

  const totalScore = Math.round(
    factors.reduce((sum, f) => sum + f.weighted, 0)
  );

  const { autoApprove, manualReview } = config.scoring.thresholds;

  let decision: Decision;
  if (totalScore >= autoApprove) {
    decision = "approved";
  } else if (totalScore >= manualReview) {
    decision = "flagged_for_review";
  } else {
    decision = "denied";
  }

  return { totalScore, decision, factors };
}
