import mongoose from "mongoose";
import FlashSale from "../models/flashSale/flashSale.model.js";
import FlashSaleItem from "../models/flashSale/flashSaleItem.model.js";
import Variant from "../models/vendorShop/variant.model.js";
import { invalidatePriceCache } from "./pricing.service.js";
import redis from "../config/redis.config.js";

const LUA_DECREMENT = `
  local stock = redis.call('GET', KEYS[1])
  if not stock then return -2 end
  if tonumber(stock) < tonumber(ARGV[1]) then return -1 end
  return redis.call('DECRBY', KEYS[1], ARGV[1])
`;

export function buildStatusFilter(status) {
  const now = new Date();
  switch (status) {
    case "UPCOMING":
      return { isCancelled: false, startDateTime: { $gt: now } };
    case "ACTIVE":
      return {
        isCancelled: false,
        startDateTime: { $lte: now },
        endDateTime: { $gte: now },
      };
    case "COMPLETED":
      return { isCancelled: false, endDateTime: { $lt: now } };
    case "CANCELLED":
      return { isCancelled: true };
    default:
      return {};
  }
}

export async function createFlashSale({
  label,
  moduleId,
  vendorId,
  startDateTime,
  endDateTime,
  items,
  createdBy,
}) {
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);

  if (start >= end) {
    throw new Error("startDateTime must be before endDateTime");
  }

  const variantIds = items.map((i) => i.variantId);

  // Overlap check
  const overlappingSales = await FlashSale.find({
    isCancelled: false,
    startDateTime: { $lt: end },
    endDateTime: { $gt: start },
  })
    .select("_id")
    .lean();

  if (overlappingSales.length > 0) {
    const overlappingSaleIds = overlappingSales.map((s) => s._id);
    const conflict = await FlashSaleItem.findOne({
      flashSaleId: { $in: overlappingSaleIds },
      variantId: { $in: variantIds },
    }).lean();

    if (conflict) {
      throw new Error(
        `CONFLICT: Variant ${conflict.variantId} is already in an overlapping flash sale`,
      );
    }
  }

  const variants = await Variant.find({ _id: { $in: variantIds } })
    .select("_id price stock mrp Type moq")
    .lean();

  if (variants.length !== variantIds.length) {
    throw new Error("One or more variant IDs are invalid");
  }

  const variantMap = Object.fromEntries(
    variants.map((v) => [v._id.toString(), v]),
  );

  for (const item of items) {
    const v = variantMap[item.variantId.toString()];
    if (!v) throw new Error(`Variant ${item.variantId} not found`);
    if (item.allocatedStock > v.stock) {
      throw new Error(
        `Variant ${item.variantId}: allocatedStock (${item.allocatedStock}) exceeds available stock (${v.stock})`,
      );
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [flashSale] = await FlashSale.create(
      [
        {
          label,
          moduleId,
          vendorId,
          startDateTime: start,
          endDateTime: end,
          createdBy,
        },
      ],
      { session },
    );

    const itemDocs = items.map((item) => {
      const basePrice = variantMap[item.variantId.toString()].price;
      const flashPrice = Math.max(
        Math.round(basePrice - (basePrice * item.flashDiscountPercent) / 100),
        1,
      );
      return {
        flashSaleId: flashSale._id,
        productId: item.productId,
        variantId: item.variantId,
        basePriceSnapshot: basePrice,
        flashDiscountPercent: item.flashDiscountPercent,
        flashPrice,
        allocatedStock: item.allocatedStock,
        sold: 0,
      };
    });

    await FlashSaleItem.insertMany(itemDocs, { session });
    await session.commitTransaction();

    // Init Redis stock counters with TTL = sale duration
    const ttlSecs = Math.max(Math.ceil((end - new Date()) / 1000), 60);
    const flashItems = await FlashSaleItem.find({
      flashSaleId: flashSale._id,
    }).lean();
    await Promise.all(
      flashItems.map(async (fi) => {
        await redis.set(
          `flash:stock:${fi._id}`,
          fi.allocatedStock,
          "EX",
          ttlSecs,
        );
        await invalidatePriceCache(fi.variantId);
      }),
    );

    return flashSale.toJSON();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// export async function updateFlashSaleAndItem(flashSaleId, payload) {
//   const { startDateTime, endDateTime, flashDiscountPercent, allocatedStock } =
//     payload;

//   const sale = await FlashSale.findById(flashSaleId);
//   if (!sale) throw new Error("Flash sale not found");

//   if (payload.label || payload.moduleId || payload.vendorId) {
//     throw new Error("label, moduleId, vendorId cannot be updated");
//   }

//   const start = startDateTime ? new Date(startDateTime) : sale.startDateTime;

//   const end = endDateTime ? new Date(endDateTime) : sale.endDateTime;

//   if (start >= end) {
//     throw new Error("startDateTime must be before endDateTime");
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     await FlashSale.findByIdAndUpdate(
//       flashSaleId,
//       {
//         startDateTime: start,
//         endDateTime: end,
//       },
//       { session },
//     );

//     const item = await FlashSaleItem.findOne({
//       _id: itemId,
//       flashSaleId,
//     }).session(session);

//     if (!item) throw new Error("Item not found");

//     const variant = await Variant.findById(item.variantId)
//       .select("price stock")
//       .lean();

//     // discount
//     if (flashDiscountPercent !== undefined) {
//       item.flashDiscountPercent = flashDiscountPercent;

//       item.flashPrice = Math.max(
//         Math.round(
//           variant.price - (variant.price * flashDiscountPercent) / 100,
//         ),
//         1,
//       );
//     }

//     // stock
//     if (allocatedStock !== undefined) {
//       if (allocatedStock > variant.stock) {
//         throw new Error("Allocated stock exceeds available stock");
//       }

//       if (allocatedStock < item.sold) {
//         throw new Error("Allocated stock cannot be less than sold");
//       }

//       item.allocatedStock = allocatedStock;
//     }

//     await item.save({ session });

//     await session.commitTransaction();

//     // ✅ Redis update
//     const ttlSecs = Math.max(Math.ceil((end - new Date()) / 1000), 60);

//     await redis.set(
//       `flash:stock:${item._id}`,
//       item.allocatedStock,
//       "EX",
//       ttlSecs,
//     );

//     await invalidatePriceCache(item.variantId);

//     return {
//       success: true,
//       message: "Flash sale & item updated successfully",
//     };
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// }

export async function updateFlashSale(flashSaleId, payload) {
  const { itemUpdates = [], startDateTime, endDateTime } = payload;

  const sale = await FlashSale.findById(flashSaleId);
  if (!sale) throw new Error("Flash sale not found");

  if (payload.label || payload.moduleId || payload.vendorId) {
    throw new Error("Not allowed to update restricted fields");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const start = startDateTime ? new Date(startDateTime) : sale.startDateTime;

    const end = endDateTime ? new Date(endDateTime) : sale.endDateTime;

    if (start >= end) {
      throw new Error("Invalid date range");
    }

    await FlashSale.findByIdAndUpdate(
      flashSaleId,
      { startDateTime: start, endDateTime: end },
      { session },
    );

    for (const upd of itemUpdates) {
      const item = await FlashSaleItem.findOne({
        _id: upd.itemId,
        flashSaleId,
      }).session(session);

      if (!item) throw new Error(`Item not found: ${upd.itemId}`);

      const variant = await Variant.findById(item.variantId)
        .select("price stock")
        .lean();

      if (upd.flashDiscountPercent !== undefined) {
        item.flashDiscountPercent = upd.flashDiscountPercent;

        item.flashPrice = Math.max(
          Math.round(
            variant.price - (variant.price * upd.flashDiscountPercent) / 100,
          ),
          1,
        );
      }

      if (upd.allocatedStock !== undefined) {
        if (upd.allocatedStock > variant.stock) {
          throw new Error("Stock exceeded");
        }

        if (upd.allocatedStock < item.sold) {
          throw new Error("Invalid stock < sold");
        }

        item.allocatedStock = upd.allocatedStock;
      }

      await item.save({ session });
    }

    await session.commitTransaction();

    return {
      success: true,
      message: "Flash sale updated successfully",
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function cancelFlashSale(flashSaleId) {
  const sale = await FlashSale.findById(flashSaleId);
  if (!sale) throw new Error("Flash sale not found");
  if (sale.isCancelled) throw new Error("Flash sale is already cancelled");
  if (new Date() > sale.endDateTime)
    throw new Error("Flash sale is already completed");

  sale.isCancelled = true;
  await sale.save();

  const items = await FlashSaleItem.find({ flashSaleId })
    .select("variantId")
    .lean();
  await Promise.all(
    items.map(async (item) => {
      await redis.del(`flash:stock:${item._id}`);
      await invalidatePriceCache(item.variantId);
    }),
  );

  return sale.toJSON();
}

export async function lockFlashStock(flashItemId, qty = 1) {
  const key = `flash:stock:${flashItemId}`;
  const result = await redis.eval(LUA_DECREMENT, 1, key, String(qty));

  if (result === -2) throw new Error("FLASH_ITEM_NOT_IN_REDIS");
  if (result === -1) throw new Error("FLASH_STOCK_EXHAUSTED");

  setImmediate(() => {
    FlashSaleItem.findByIdAndUpdate(flashItemId, { $inc: { sold: qty } }).catch(
      (err) => console.error("[FlashSale] sold sync error:", err.message),
    );
  });

  return result;
}
