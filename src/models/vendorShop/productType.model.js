import mongoose from "mongoose";
//subCategoryId, typeName, status
const productTypeSchema = mongoose.Schema(
  {
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
      index: true,
    },

    typeName: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("ProductType", productTypeSchema);
