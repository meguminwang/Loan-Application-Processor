import { Router, Request, Response, NextFunction } from "express";
import { basicAuth } from "./auth";
import prisma from "../db";
import { ApplicationNotFoundError, InvalidStateTransitionError } from "../errors";
import { ApplicationStatus, transitionTo } from "../state-machine";

const router = Router();
router.use(basicAuth);

/**
 * GET /admin/applications
 * List applications, optionally filtered by status.
 */
router.get(
  "/applications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.query;
      const where = status ? { status: status as string } : {};

      const applications = await prisma.application.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          applicantName: true,
          email: true,
          loanAmount: true,
          score: true,
          status: true,
          createdAt: true,
          retryCount: true,
        },
      });

      res.json({ count: applications.length, applications });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /admin/applications/:id
 * Full detail view including score breakdown, audit trail, and webhook events.
 */
router.get(
  "/applications/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const application = await prisma.application.findUnique({
        where: { id: req.params.id as string },
        include: {
          auditLogs: { orderBy: { createdAt: "asc" } },
          webhookEvents: { orderBy: { processedAt: "asc" } },
        },
      });

      if (!application) {
        throw new ApplicationNotFoundError(req.params.id as string);
      }

      res.json({
        ...application,
        scoreBreakdown: application.scoreBreakdown
          ? JSON.parse(application.scoreBreakdown)
          : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /admin/applications/:id/review
 * Manual review: approve, deny, or partially_approve a flagged application.
 *
 * Body: { "decision": "approved" | "denied" | "partially_approved", "note": "...", "approved_loan_amount": 1000 }
 */
router.post(
  "/applications/:id/review",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { decision, note, approved_loan_amount } = req.body;

      const validDecisions = ["approved", "denied", "partially_approved"];
      if (!validDecisions.includes(decision)) {
        res.status(400).json({
          error: {
            code: "INVALID_DECISION",
            message: `Decision must be one of: ${validDecisions.join(", ")}`,
          },
        });
        return;
      }

      const application = await prisma.application.findUnique({
        where: { id: req.params.id as string },
      });

      if (!application) {
        throw new ApplicationNotFoundError(req.params.id as string);
      }

      // Transition to the review decision
      await transitionTo(
        application.id,
        decision as ApplicationStatus,
        {
          metadata: {
            reviewer: "admin",
            note: note ?? null,
            approved_loan_amount: approved_loan_amount ?? null,
          },
        }
      );

      // If partially_approved, store the reduced loan amount
      if (decision === "partially_approved" && approved_loan_amount) {
        await prisma.application.update({
          where: { id: application.id },
          data: { approvedLoanAmount: approved_loan_amount },
        });
      }

      // If approved or partially_approved, queue for disbursement
      if (decision === "approved" || decision === "partially_approved") {
        await transitionTo(
          application.id,
          ApplicationStatus.DISBURSEMENT_QUEUED,
          {
            metadata: {
              reason: `Manual review: ${decision}`,
              approved_loan_amount: approved_loan_amount ?? application.loanAmount,
            },
          }
        );
        await prisma.application.update({
          where: { id: application.id },
          data: { disbursementQueuedAt: new Date() },
        });
      }

      const updated = await prisma.application.findUnique({
        where: { id: application.id },
        include: { auditLogs: { orderBy: { createdAt: "asc" } } },
      });

      res.json({
        ...updated,
        scoreBreakdown: updated?.scoreBreakdown
          ? JSON.parse(updated.scoreBreakdown)
          : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
