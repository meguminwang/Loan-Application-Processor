import prisma from "../db";
import { Prisma } from "@prisma/client";
import { config } from "../config";
import { ApplicationStatus, transitionTo } from "../state-machine";
import { ApplicationNotFoundError, WebhookReplayError } from "../errors";
import { v4 as uuidv4 } from "uuid";

export interface WebhookPayload {
  application_id: string;
  status: "success" | "failed";
  transaction_id: string;
  timestamp: string;
}

/**
 * Process a disbursement webhook.
 *
 * Idempotency strategy:
 *   - Same transaction_id → no-op (WebhookReplayError with 200 status)
 *   - Each NEW webhook call (new transaction_id) → creates WebhookEvent + AuditLog
 *   - Handles concurrent duplicates via unique constraint (P2002)
 *
 * Retry strategy:
 *   - On failure, increment retry count and transition to disbursement_failed
 *   - disbursement_failed can be retried (→ disbursement_queued) up to maxRetries
 *   - After maxRetries, flag for manual review via audit log
 *   - Each retry has a unique retry_id in the audit log (satisfies finance team)
 */
export async function processDisbursementWebhook(payload: WebhookPayload) {
  // 1. Idempotency check: has this transaction_id been processed before?
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { transactionId: payload.transaction_id },
  });

  if (existingEvent) {
    throw new WebhookReplayError(payload.transaction_id);
  }

  // 2. Find the application
  const application = await prisma.application.findUnique({
    where: { id: payload.application_id },
  });

  if (!application) {
    throw new ApplicationNotFoundError(payload.application_id);
  }

  // 3. Record the webhook event (for idempotency)
  // Catch P2002 unique constraint violation for concurrent duplicate requests
  try {
    await prisma.webhookEvent.create({
      data: {
        transactionId: payload.transaction_id,
        applicationId: payload.application_id,
        status: payload.status,
        timestamp: new Date(payload.timestamp),
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new WebhookReplayError(payload.transaction_id);
    }
    throw error;
  }

  // 4. Process based on status
  if (payload.status === "success") {
    return await handleSuccess(application, payload);
  } else {
    return await handleFailure(application, payload);
  }
}

async function handleSuccess(
  application: { id: string; status: string },
  payload: WebhookPayload
) {
  // Transition: disbursement_queued → disbursed (or disbursement_failed → disbursed for late success)
  await transitionTo(
    application.id,
    ApplicationStatus.DISBURSED,
    {
      metadata: {
        transaction_id: payload.transaction_id,
        webhook_status: "success",
      },
    }
  );

  return {
    application_id: application.id,
    status: "disbursed",
    transaction_id: payload.transaction_id,
  };
}

async function handleFailure(
  application: { id: string; status: string; retryCount: number },
  payload: WebhookPayload
) {
  const retryId = uuidv4();
  const newRetryCount = application.retryCount + 1;
  const maxRetries = config.disbursement.maxRetries;

  // Wrap entire failure handling in a single transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    // Transition: disbursement_queued → disbursement_failed
    await transitionTo(
      application.id,
      ApplicationStatus.DISBURSEMENT_FAILED,
      {
        metadata: {
          transaction_id: payload.transaction_id,
          webhook_status: "failed",
          retry_id: retryId,
          retry_count: newRetryCount,
          max_retries: maxRetries,
        },
        tx,
      }
    );

    // Update retry count atomically within the same transaction
    await tx.application.update({
      where: { id: application.id },
      data: { retryCount: newRetryCount },
    });

    // Can we auto-retry?
    if (newRetryCount <= maxRetries) {
      // Auto-retry: disbursement_failed → disbursement_queued
      await transitionTo(
        application.id,
        ApplicationStatus.DISBURSEMENT_QUEUED,
        {
          metadata: {
            retry_id: retryId,
            retry_count: newRetryCount,
            reason: `Auto-retry ${newRetryCount}/${maxRetries}`,
          },
          tx,
        }
      );

      await tx.application.update({
        where: { id: application.id },
        data: { disbursementQueuedAt: new Date() },
      });

      return {
        application_id: application.id,
        status: "disbursement_queued",
        retry_id: retryId,
        retry_count: newRetryCount,
        message: `Retry ${newRetryCount}/${maxRetries} — re-queued for disbursement`,
      };
    } else {
      // Max retries exhausted — log escalation in audit trail
      await tx.auditLog.create({
        data: {
          applicationId: application.id,
          action: "disbursement_escalated",
          fromStatus: ApplicationStatus.DISBURSEMENT_FAILED,
          metadata: JSON.stringify({
            retry_id: retryId,
            retry_count: newRetryCount,
            reason: `Max retries (${maxRetries}) exhausted — escalating to manual review`,
          }),
        },
      });

      return {
        application_id: application.id,
        status: "disbursement_failed",
        retry_id: retryId,
        retry_count: newRetryCount,
        message: `Max retries (${maxRetries}) exhausted — escalated to manual review`,
      };
    }
  });
}
