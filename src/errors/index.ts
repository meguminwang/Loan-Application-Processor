/**
 * Base class for all application-specific errors.
 * Carries an HTTP status code so the error handler can respond correctly.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when a state transition is not allowed by the state machine.
 * e.g., denied → processing
 */
export class InvalidStateTransitionError extends AppError {
  constructor(
    public readonly from: string,
    public readonly to: string
  ) {
    super(
      `Invalid state transition: ${from} → ${to}`,
      422,
      "INVALID_STATE_TRANSITION"
    );
  }
}

/**
 * Thrown when a duplicate application is detected.
 * Same email + loan_amount within the deduplication window.
 */
export class DuplicateApplicationError extends AppError {
  constructor(
    public readonly existingApplicationId: string
  ) {
    super(
      `Duplicate application detected. Existing application: ${existingApplicationId}`,
      409,
      "DUPLICATE_APPLICATION"
    );
  }
}

/**
 * Thrown when a webhook with the same transaction_id has already been processed.
 */
export class WebhookReplayError extends AppError {
  constructor(
    public readonly transactionId: string
  ) {
    super(
      `Webhook already processed for transaction: ${transactionId}`,
      200, // Idempotent — return 200, not an error status
      "WEBHOOK_REPLAY"
    );
  }
}

/**
 * Thrown when the application is not found.
 */
export class ApplicationNotFoundError extends AppError {
  constructor(applicationId: string) {
    super(
      `Application not found: ${applicationId}`,
      404,
      "APPLICATION_NOT_FOUND"
    );
  }
}

export { ValidationError } from "./validation";
