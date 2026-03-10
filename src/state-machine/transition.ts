import prisma from "../db";
import { Prisma } from "@prisma/client";
import { ApplicationStatus } from "./states";
import { validateTransition } from "./machine";
import { ApplicationNotFoundError } from "../errors";

export type TxClient = Prisma.TransactionClient;

interface TransitionOptions {
  metadata?: Record<string, unknown>;
  tx?: TxClient;
}

/**
 * Transitions an application to a new state.
 * Uses a transaction with optimistic locking to prevent race conditions:
 * 1. Read current state inside transaction
 * 2. Validate transition via state machine
 * 3. Update with WHERE clause that includes current status (if another request
 *    changed the status between read and write, the update affects 0 rows)
 * 4. Write audit log
 *
 * If `options.tx` is provided, participates in the caller's transaction.
 * Otherwise, creates its own transaction.
 *
 * Returns the updated application.
 */
export async function transitionTo(
  applicationId: string,
  targetStatus: ApplicationStatus,
  options: TransitionOptions = {}
) {
  if (options.tx) {
    return await executeTransition(options.tx, applicationId, targetStatus, options);
  }
  return await prisma.$transaction(async (tx) => {
    return await executeTransition(tx, applicationId, targetStatus, options);
  });
}

async function executeTransition(
  tx: TxClient,
  applicationId: string,
  targetStatus: ApplicationStatus,
  options: TransitionOptions
) {
  const application = await tx.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) {
    throw new ApplicationNotFoundError(applicationId);
  }

  const fromStatus = application.status as ApplicationStatus;
  validateTransition(fromStatus, targetStatus);

  // Optimistic lock: only update if status hasn't changed since we read it
  const updated = await tx.application.updateMany({
    where: { id: applicationId, status: fromStatus },
    data: {
      status: targetStatus,
      updatedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    throw new Error(`Concurrent state modification detected for application ${applicationId}`);
  }

  await tx.auditLog.create({
    data: {
      applicationId,
      action: "state_transition",
      fromStatus,
      toStatus: targetStatus,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    },
  });

  return await tx.application.findUnique({
    where: { id: applicationId },
  });
}
