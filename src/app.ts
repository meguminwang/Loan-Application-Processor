import express from "express";
import { errorHandler } from "./errors/handler";
import { applicationRoutes } from "./applications";
import { webhookRoutes } from "./webhook";
import { adminRoutes } from "./admin";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/applications", applicationRoutes);
app.use("/webhook", webhookRoutes);
app.use("/admin", adminRoutes);

// Global error handler (must be after all routes)
app.use(errorHandler);

export default app;
