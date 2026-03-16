import { Router } from "express";
const router = Router();
import vendorAuth from "./vendor.routes.js";
import shoptiming from "./shoptiming.routes.js";
import vendorReview from "./vendorReview.routes.js";
import vendorWallet from "./vendorWallet.routes.js";
import vendorWithdrawal from "./vendorWithdrawalBalance.routes.js";

router.use("/vendor", vendorReview);
router.use("/vendor", shoptiming);
router.use("/vendor", vendorWallet);
router.use("/vendor", vendorWithdrawal);
router.use("/vendor", vendorAuth);

export default router;
//asgr
