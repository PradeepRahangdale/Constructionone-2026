//asgr
import { Router } from "express";
import {
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
  similarProducts,
  // getCartWithDistances,
  checkoutPreview,
  calculateDeliveryFee,
} from "../../controllers/user/cart.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/addToCart", requireAuth, addToCart);
router.get("/getCart", requireAuth, getCart);
router.put("/update-quantity", requireAuth, updateCartItem);
router.delete("/remove/:variantId", requireAuth, removeCartItem);
router.get("/similar/:productId", requireAuth, similarProducts);
// router.get("/cart-with-distances", requireAuth, getCartWithDistances);
router.post("/checkout-preview", requireAuth, checkoutPreview);
router.post("/calculate-delivery-fee", requireAuth, calculateDeliveryFee);

export default router;
