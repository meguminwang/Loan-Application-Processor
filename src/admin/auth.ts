import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Basic authentication middleware for admin endpoints.
 */
export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  if (username === config.admin.username && password === config.admin.password) {
    next();
  } else {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
  }
}
