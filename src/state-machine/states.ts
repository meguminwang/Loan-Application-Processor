/**
 * All possible application states.
 * Using a const enum-like pattern for type safety + runtime values.
 */
export const ApplicationStatus = {
  SUBMITTED: "submitted",
  PROCESSING: "processing",
  APPROVED: "approved",
  DENIED: "denied",
  FLAGGED_FOR_REVIEW: "flagged_for_review",
  PARTIALLY_APPROVED: "partially_approved",
  DISBURSEMENT_QUEUED: "disbursement_queued",
  DISBURSED: "disbursed",
  DISBURSEMENT_FAILED: "disbursement_failed",
} as const;

export type ApplicationStatus =
  (typeof ApplicationStatus)[keyof typeof ApplicationStatus];
