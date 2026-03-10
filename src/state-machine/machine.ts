import { ApplicationStatus } from "./states";
import { InvalidStateTransitionError } from "../errors";

/**
 * The transition table: for each state, lists which states it can move to.
 * This IS the state machine. If a transition isn't in this table, it's illegal.
 *
 * State diagram:
 *   submitted → processing
 *   processing → approved | denied | flagged_for_review
 *   approved → disbursement_queued
 *   flagged_for_review → approved | denied | partially_approved (manual review)
 *   partially_approved → disbursement_queued (with reduced amount)
 *   disbursement_queued → disbursed | disbursement_failed
 *   disbursement_failed → disbursement_queued (retry) | disbursed (late success)
 *
 * Terminal states: denied, disbursed (no outgoing transitions)
 */
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.PROCESSING],
  [ApplicationStatus.PROCESSING]: [
    ApplicationStatus.APPROVED,
    ApplicationStatus.DENIED,
    ApplicationStatus.FLAGGED_FOR_REVIEW,
  ],
  [ApplicationStatus.APPROVED]: [ApplicationStatus.DISBURSEMENT_QUEUED],
  [ApplicationStatus.DENIED]: [], // Terminal state
  [ApplicationStatus.FLAGGED_FOR_REVIEW]: [
    ApplicationStatus.APPROVED,
    ApplicationStatus.DENIED,
    ApplicationStatus.PARTIALLY_APPROVED,
  ],
  [ApplicationStatus.PARTIALLY_APPROVED]: [ApplicationStatus.DISBURSEMENT_QUEUED],
  [ApplicationStatus.DISBURSEMENT_QUEUED]: [
    ApplicationStatus.DISBURSED,
    ApplicationStatus.DISBURSEMENT_FAILED,
  ],
  [ApplicationStatus.DISBURSED]: [], // Terminal state
  [ApplicationStatus.DISBURSEMENT_FAILED]: [
    ApplicationStatus.DISBURSEMENT_QUEUED,
    ApplicationStatus.DISBURSED, // Allow late success webhooks
  ],
};

/**
 * Validates and returns the new state if the transition is allowed.
 * Throws InvalidStateTransitionError if not.
 */
export function validateTransition(
  from: ApplicationStatus,
  to: ApplicationStatus
): ApplicationStatus {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
  return to;
}

/**
 * Returns all valid next states from a given state.
 * Useful for API responses and debugging.
 */
export function getValidTransitions(from: ApplicationStatus): readonly string[] {
  return VALID_TRANSITIONS[from] || [];
}
