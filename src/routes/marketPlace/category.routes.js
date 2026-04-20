import { Router } from "express";
import {
  getCategoryTree,
  getCategoryTreeForAdmin,
  getAllCategories,
} from "../../controllers/marketPlace/category.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
const router = Router();

router.get("/", requireAuth, getAllCategories);
router.get("/categories", getCategoryTree);
router.get("/categories/admin", getCategoryTreeForAdmin);
export default router;
