import { Router } from "express";
import {
  toggleWishlist,
  getWishlist,
  addToWishlist,
} from "../../controllers/user/wishlist.controller.js";
import { authMiddleware } from "../../middlewares/auth.js";
const router = Router();

router.patch("/", authMiddleware, toggleWishlist);
router.get("/", authMiddleware, getWishlist);
router.post("/", authMiddleware, addToWishlist);

export default router;
