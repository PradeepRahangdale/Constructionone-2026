import Router from "express";
import { getInventory} from "../../controllers/vendorShop/inventory.controller.js";
import { vendorMiddleware } from "../../middlewares/auth.js";
const router = Router();
router.get("/inventory", getInventory);
export default router;
