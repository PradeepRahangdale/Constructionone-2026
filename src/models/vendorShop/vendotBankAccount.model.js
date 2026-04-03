import mongoose from "mongoose";

const vendorBankAccountSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vendorProfile",
      required: true,
    },

    accountHolderName: {
      type: String,
      required: true,
    },

    accountNumber: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      enum: ["Saving", "Current", "NRO", "NRE", "Other"],
      default: "Other",
    },

    ifscCode: {
      type: String,
      required: true,
    },

    bankName: {
      type: String,
      required: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    upiId: {
      type: String,
    },
  },
  { timestamps: true },
);

export default mongoose.model("VendorBankAccount", vendorBankAccountSchema);
