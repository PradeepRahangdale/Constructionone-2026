import mongoose from "mongoose";

const orderTrackingSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "orderModel",
      required: true,
    },

    status: {
      type: String,
      required: true,
    },

    message: {
      type: String,
    },

    location: {
      type: String,
    },

    updatedBy: {
      type: String,
      enum: ["SYSTEM", "LOGISTICS", "ADMIN", "VENDOR"],
      default: "SYSTEM",
    }
  },
  { timestamps: true }
);

export default mongoose.model("orderTrackingModel", orderTrackingSchema);