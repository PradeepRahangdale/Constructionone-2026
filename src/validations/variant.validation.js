// import Joi from "joi";

// export const createVariantSchema = Joi.object({
//   moduleId: Joi.string().required(),
//   pcategoryId: Joi.string().required(),
//   categoryId: Joi.string().required(),
//   subcategoryId: Joi.string().required(),
//   brandId: Joi.string().required(),
//   productId: Joi.string().required(),

//   name: Joi.string().required(),
//   sku: Joi.string().allow("", null),

//   price: Joi.number().min(0).required(),
//   unit: Joi.string().allow("", null),
//   attributes: Joi.object(),

//   Type: Joi.string().valid("BULK", "RETAIL").required(),

//   stock: Joi.number().min(0).required(),

//   status: Joi.string().valid("active", "inactive"),
// })
//   // 🔥 YOUR BUSINESS RULE
//   .custom((value, helpers) => {
//     if (value.Type === "BULK" && value.stock < 50) {
//       return helpers.message("Bulk variant must have stock ≥ 50");
//     }

//     if (value.Type === "RETAIL" && value.stock < 1) {
//       return helpers.message("Retail variant must have stock ≥ 1");
//     }

//     return value;
//   });

import Joi from "joi";

export const createVariantSchema = Joi.object({
  mrp: Joi.number().required(),

  discount: Joi.number().optional(),

  size: Joi.string().allow("", null),

  stock: Joi.number().required(),

  Type: Joi.string().valid("BULK", "RETAIL").required(),

  moq: Joi.number().optional(),

  packageWeight: Joi.number().optional(),

  packageDimensions: Joi.string().allow("", null),

  isDefault: Joi.boolean().optional(),
});
