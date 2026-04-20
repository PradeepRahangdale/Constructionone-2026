import ProductTypeController from "../../controllers/vendorShop/productType.controller.js";
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
const router = Router();

router.post("/create", requireAuth, ProductTypeController.createProductType);

// ===============================
// GET All Product Types
// GET /api/product-type/all
// ===============================

router.get(
  "/:subcategoryId",
  requireAuth,
  ProductTypeController.getAllProductTypes,
);

router.get(
  "/admin/:subcategoryId",
  requireAuth,
  ProductTypeController.getAllProductTypesAdmin,
);



// ===============================
// GET Single Product Type
// GET /api/product-type/:id
// ===============================

router.get("/:id", requireAuth, ProductTypeController.getSingleProductType);
router.patch("/:id", requireAuth, ProductTypeController.toggleProductTypeStatus);

// ===============================
// UPDATE Product Type
// PUT /api/product-type/update/:id
// ===============================
router.put("/update/:id", requireAuth, ProductTypeController.updateProductType);

// ===============================
// DELETE Product Type
// DELETE /api/product-type/delete/:id
// ===============================
router.delete(
  "/delete/:id",
  requireAuth,
  ProductTypeController.deleteProductType,
);

export default router;
