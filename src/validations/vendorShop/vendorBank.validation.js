import { body, param } from "express-validator";

// Add Bank Account Validation
export const validateAddBankAccount = [
  body("accountHolderName")
    .notEmpty()
    .withMessage("Account holder name is required")
    .isLength({ min: 3 })
    .withMessage("Name must be at least 3 characters"),

  body("accountNumber")
    .notEmpty()
    .withMessage("Account number is required")
    .isLength({ min: 8, max: 18 })
    .withMessage("Account number must be 8-18 digits")
    .isNumeric()
    .withMessage("Account number must be numeric"),

  body("ifscCode")
    .notEmpty()
    .withMessage("IFSC code is required")
    .isLength({ min: 11, max: 11 })
    .withMessage("IFSC must be 11 characters"),

  body("bankName").notEmpty().withMessage("Bank name is required"),

  body("accountType")
    .optional()
    .isIn(["Saving", "Current", "NRO", "NRE", "Other"])
    .withMessage("Invalid account type"),

  body("upiId")
    .optional()
    .matches(/^[\w.-]+@[\w.-]+$/)
    .withMessage("Invalid UPI ID"),
];

// Set Default Bank Validation
export const validateSetDefaultBank = [
  body("bankAccountId")
    .notEmpty()
    .withMessage("Bank account ID is required")
    .isMongoId()
    .withMessage("Invalid bank account ID"),
];

//  Delete Bank Validation
export const validateDeleteBank = [
  param("id")
    .notEmpty()
    .withMessage("Bank ID is required")
    .isMongoId()
    .withMessage("Invalid bank ID"),
];

export const validateWithdrawal = [
  body("bankAccountId")
    .optional() //  optional (default bank use ho sakta hai)
    .isMongoId()
    .withMessage("Invalid bank account ID"),

  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 1 })
    .withMessage("Amount must be greater than 0"),
];
