import { Router, Request, Response, NextFunction } from "express";
import { processDisbursementWebhook } from "./service";
import { WebhookReplayError } from "../errors";
import { validateWebhookPayload } from "../errors/validation";

const router = Router();

/**
 * POST /webhook/disbursement
 * Receive disbursement status from external payment system.
 */
router.post(
  "/disbursement",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      validateWebhookPayload(req.body);
      const result = await processDisbursementWebhook(req.body);
      res.json(result);
    } catch (err) {
      // WebhookReplayError is idempotent — return 200 with info, not an error
      if (err instanceof WebhookReplayError) {
        res.status(200).json({
          message: "Webhook already processed (idempotent)",
          transaction_id: err.transactionId,
        });
        return;
      }
      next(err);
    }
  }
);

export default router;
