import { Router } from "express";
import {
  toggleWishlist,
  getWishlist,
} from "../../controllers/user/wishlist.controller.js";
import { authMiddleware } from "../../middlewares/auth.js";
const router = Router();

router.patch("/", authMiddleware, toggleWishlist);
router.get("/", authMiddleware, getWishlist);

export default router;
