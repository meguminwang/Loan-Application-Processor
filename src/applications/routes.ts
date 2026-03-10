import { Router, Request, Response, NextFunction } from "express";
import { createApplication, getApplication } from "./service";
import { validateApplicationInput } from "../errors/validation";
import { DuplicateApplicationError } from "../errors";

const router = Router();

/**
 * POST /applications
 * Submit a new loan application.
 */
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      validateApplicationInput(req.body);
      const result = await createApplication(req.body);
      res.status(201).json(result);
    } catch (err) {
      // Return existing application ID in structured field (spec requirement)
      if (err instanceof DuplicateApplicationError) {
        res.status(409).json({
          error: {
            code: err.code,
            message: err.message,
            existing_application_id: err.existingApplicationId,
          },
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /applications/:id
 * Get application details including score breakdown and audit trail.
 */
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getApplication(req.params.id as string);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
