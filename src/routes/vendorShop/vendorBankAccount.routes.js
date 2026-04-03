import { Router } from "express";
import {
  addBankAccount,
  getVendorBankAccounts,
  deleteBankAccount,
  setDefaultBankAccount,
} from "../../controllers/vendorShop/vendorBankAccount.controller.js";
// validators
import {
  validateAddBankAccount,
  validateSetDefaultBank,
  validateDeleteBank,
} from "../../validations/vendorShop/vendorBank.validation.js";
import validate from "../../middlewares/joiValidation.js"; //
import { vendorMiddleware } from "../../middlewares/auth.js";
const router = Router();

router.post(
  "/add",
  validate(validateAddBankAccount),
  vendorMiddleware,
  addBankAccount,
);

router.get("/list", vendorMiddleware, getVendorBankAccounts);

router.post(
  "/set-default",
  validate(validateSetDefaultBank),
  setDefaultBankAccount,
);
router.delete(
  "/delete/:id",
  vendorMiddleware,
  validate(validateDeleteBank),
  deleteBankAccount,
);

export default router;
