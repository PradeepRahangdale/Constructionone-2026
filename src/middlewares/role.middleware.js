/**
 * Written by Pradeep
 */
import { APIError } from "./errorHandler.js";

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new APIError(403, "You do not have permission to perform this action"),
      );
    }
    next();
  };
};
export const requirePermission = (...permissions) => {
  return (req, res, next) => {
    // Check user exists
    if (!req.user) {
      return next(new APIError(401, "Unauthorized"));
    }

    // Admin has all permissions
    if (req.user.role === "ADMIN") {
      return next();
    }

    // Check permissions safely
    if (
      !req.user.permissions ||
      !permissions.some((perm) => req.user.permissions.includes(perm))
    ) {
      return next(
        new APIError(403, "You do not have permission to perform this action"),
      );
    }

    next();
  };
};
