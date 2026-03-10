import { AppError } from "./index";

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/**
 * Validates that all required fields are present and of correct type.
 */
export function validateApplicationInput(body: Record<string, unknown>): void {
  const required: [string, string][] = [
    ["applicant_name", "string"],
    ["email", "string"],
    ["loan_amount", "number"],
    ["stated_monthly_income", "number"],
    ["employment_status", "string"],
  ];

  for (const [field, type] of required) {
    if (body[field] === undefined || body[field] === null) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
    if (typeof body[field] !== type) {
      throw new ValidationError(`Field "${field}" must be a ${type}, got ${typeof body[field]}`);
    }
  }

  const validStatuses = ["employed", "self-employed", "unemployed"];
  if (!validStatuses.includes(body.employment_status as string)) {
    throw new ValidationError(
      `Invalid employment_status: "${body.employment_status}". Must be one of: ${validStatuses.join(", ")}`
    );
  }

  if ((body.loan_amount as number) <= 0) {
    throw new ValidationError("loan_amount must be positive");
  }

  if ((body.stated_monthly_income as number) <= 0) {
    throw new ValidationError("stated_monthly_income must be positive");
  }
}

/**
 * Validates webhook disbursement payload.
 */
export function validateWebhookPayload(body: Record<string, unknown>): void {
  const required = ["application_id", "status", "transaction_id", "timestamp"];
  for (const field of required) {
    if (!body[field]) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
  }

  if (body.status !== "success" && body.status !== "failed") {
    throw new ValidationError(`Invalid status: "${body.status}". Must be "success" or "failed"`);
  }
}
