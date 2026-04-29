import { Router } from "express";
import {
  getBusinessRequests,
  getBusinessRequestById,
  createBusinessRequest,
  deleteBusinessRequestById,
  getAllCatogry,
} from "../../controllers/admin/businessRequest.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

const router = Router();

router.get("/selltype", getAllCatogry);
router.post("/", createBusinessRequest);
router.get("/", requireAuth, getBusinessRequests);
router.get("/:id", requireAuth, getBusinessRequestById);
router.delete("/:id", requireAuth, deleteBusinessRequestById);

export default router;
