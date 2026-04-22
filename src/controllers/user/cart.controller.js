// priyanshu
import mongoose from "mongoose";
import Cart from "../../models/user/cart.model.js";
import calculateBillSummary from "../../services/calculateBillSummary.js";
import { APIError } from "../../middlewares/errorHandler.js";
import Variant from "../../models/vendorShop/variant.model.js";
import Product from "../../models/vendorShop/product.model.js";
import Address from "../../models/user/address.model.js";
import redis from "../../config/redis.config.js";
import { getDistanceInKm } from "../../utils/getDistanceInKm.js";

export const addToCart = async (req, res, next) => {
  try {
    const { variantId, quantity } = req.body;
    const userId = req.user.id;

    const cacheKey = `cart:${userId}`;

    if (!variantId || !quantity || quantity <= 0) {
      return next(new APIError(400, "VariantId and valid quantity required"));
    }

    const variant = await Variant.findById(variantId)
      .populate("productId", "name thumbnail slug")
      .lean();

    if (!variant) {
      return next(new APIError(404, "Variant not found"));
    }

    // BULK LOGIC
    if (variant.Type === "BULK") {
      const moq = Number(variant.moq);

      if (quantity < moq)
        return next(new APIError(400, `Minimum order quantity is ${moq}`));

      if (quantity % moq !== 0)
        return next(
          new APIError(400, `Quantity must be multiple of MOQ (${moq})`),
        );
    }

    if (variant.stock < quantity)
      return next(new APIError(400, "Out of stock"));

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    const existingItem = cart.items.find(
      (item) => item.variant.toString() === variantId,
    );

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;

      if (variant.stock < newQty)
        return next(new APIError(400, "Not enough stock"));
      existingItem.quantity = newQty;
      existingItem.totalPrice = newQty * existingItem.unitPrice;
    } else {
      cart.items.push({
        variant: variant._id,
        quantity,
        unitPrice: variant.price,
        totalPrice: variant.price * quantity,
      });
    }

    const billSummary = await calculateBillSummary(cart.items);
    cart.totalAmount = billSummary.grandTotal;

    await cart.save();

    // Build SAME response structure as getCart
    const response = {
      success: true,
      message: "Cart updated successfully",
      cart: {
        _id: cart._id,
        items: cart.items.map((item) => ({
          variantId: variant._id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          product: {
            name: variant.productId.name,
            thumbnail: variant.productId.thumbnail,
            slug: variant.productId.slug,
          },
        })),
        billSummary,
      },
    };

    // Update cache instead of deleting
    await redis.set(cacheKey, JSON.stringify(response), "EX", 300);

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cacheKey = `cart:${userId}`;

    // Check Cache
    const cachedCart = await redis.get(cacheKey);
    if (cachedCart) {
      return res.status(200).json(JSON.parse(cachedCart));
    }

    let cart = await Cart.findOne({ userId })
      .populate({
        path: "items.variant",
        populate: {
          path: "productId",
          model: "Product",
          select: "name thumbnail slug",
        },
      })
      .lean();

    if (!cart) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    const validItems = cart.items.filter(
      (item) => item.variant && item.variant.productId,
    );

    const billSummary = await calculateBillSummary(validItems);

    const enrichedItems = validItems.map((item) => {
      const product = item.variant.productId;

      return {
        itemId: item._id,
        variantId: item.variant._id,
        productId: product._id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        mrp: item.mrp,
        discount: item.discount,
        totalPrice: item.totalPrice,
        product: {
          name: product.name,
          thumbnail: product.thumbnail,
          slug: product.slug,
        },
      };
    });

    const response = {
      success: true,
      message: "Cart retrieved successfully",
      cart: {
        _id: cart._id,
        items: enrichedItems,
        billSummary: {
          itemsTotal: billSummary.itemsTotal,
          taxPercentage: billSummary.taxPercentage,
          gstAmount: billSummary.gstAmount,
          deliveryCharge: billSummary.deliveryCharge,
          grandTotal: billSummary.grandTotal,
        },
      },
    };

    await redis.set(cacheKey, JSON.stringify(response), "EX", 300);

    res.status(200).json(response);
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const { variantId, action } = req.body;
    const userId = req.user.id;

    // console.log(variantId, action, userId);

    if (!variantId || !action) {
      return next(new APIError(400, "VariantId and action are required"));
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return next(new APIError(404, "Cart not found"));
    }

    // console.log(cart);

    const itemIndex = cart.items.findIndex(
      (item) => item.variant.toString() === variantId,
    );

    if (itemIndex === -1) {
      return next(new APIError(404, "Item not found in cart"));
    }

    const item = cart.items[itemIndex];
    const variant = await Variant.findById(variantId);

    if (!variant) {
      return next(new APIError(404, "Variant not found"));
    }

    let moq = 1;
    if (variant.Type === "BULK" && variant.moq) {
      moq = variant.moq;
    }

    let newQuantity = item.quantity;

    if (action === "inc") {
      newQuantity += 1;
    } else if (action === "dec") {
      newQuantity -= 1;
    } else {
      return next(new APIError(400, "Invalid action. Use 'inc' or 'dec'"));
    }

    if (newQuantity < moq) {
      return next(
        new APIError(400, `Quantity cannot be less than MOQ (${moq})`),
      );
    }

    if (variant.stock < newQuantity) {
      return next(
        new APIError(400, `Out of stock. Only ${variant.stock} available.`),
      );
    }

    item.quantity = newQuantity;
    item.totalPrice = item.unitPrice * newQuantity;

    const billSummary = await calculateBillSummary(cart.items);
    cart.totalAmount = billSummary.grandTotal;

    await cart.save();

    await redis.del(`cart:${userId}`);

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart,
    });
  } catch (error) {
    next(error);
  }
};

export const removeCartItem = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const userId = req.user.id;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return next(new APIError(404, "Cart not found"));
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.variant.toString() === variantId,
    );

    if (itemIndex === -1) {
      return next(new APIError(404, "Item not found in cart"));
    }

    cart.items.splice(itemIndex, 1);

    // Recalculate Bill Summary
    if (cart.items.length > 0) {
      const billSummary = await calculateBillSummary(cart.items);
      cart.totalAmount = billSummary.grandTotal;
    } else {
      cart.totalAmount = 0;
    }

    await cart.save();

    // Invalidate Cache
    await redis.del(`cart:${userId}`);

    res.status(200).json({
      success: true,
      message: "Item removed from cart",
      cart,
    });
  } catch (error) {
    next(error);
  }
};

export const similarProducts = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // ── Redis Cache ──────────────────────────────────────────────
    const cacheKey = `similar:${productId}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) return res.status(200).json(JSON.parse(cachedData));

    // ── Find source product ──────────────────────────────────────
    const product = await Product.findById(productId)
      .select("subcategoryId categoryId")
      .lean();

    if (!product) {
      return next(new APIError(404, "Product not found"));
    }

    // ── Aggregation pipeline ─────────────────────────────────────
    const pipeline = [
      {
        $match: {
          _id: { $ne: new mongoose.Types.ObjectId(productId) },
          subcategoryId: product.subcategoryId,
          disable: false,
          varified: true,
        },
      },
      { $limit: 10 },

      {
        $lookup: {
          from: "variants",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$productId", "$$pid"] },
                disable: false,
              },
            },
            { $sort: { price: 1 } },
            { $limit: 1 },
            {
              $project: {
                price: 1,
                mrp: 1,
                discount: 1,
                discountAmount: 1,
                Type: 1,
              },
            },
          ],
          as: "defaultVariant",
        },
      },

      { $match: { defaultVariant: { $ne: [] } } },

      {
        $project: {
          name: 1,
          slug: 1,
          thumbnail: 1,
          avgRating: 1,
          reviewCount: 1,
          sold: 1,
          measurementUnit: 1,
          defaultVariant: { $arrayElemAt: ["$defaultVariant", 0] },
        },
      },
    ];

    const products = await Product.aggregate(pipeline);

    const response = {
      success: true,
      message: "Similar products fetched successfully",
      results: products.length,
      data: { products },
    };

    await redis.set(cacheKey, JSON.stringify(response), "EX", 300);

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// GET /cart/distances?addressId=123
export const getCartWithDistances = async (req, res) => {
  try {
    // const userId = req.user.id;
    const userId = "6992ebf155e45f668bce5b09";
    const { addressId } = req.query;

    // 1. Get User Address
    const address = await Address.findOne({
      _id: addressId,
      userId,
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    const userLat = address.location.coordinates[1];
    const userLng = address.location.coordinates[0];

    // 2. Get Cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: "items.variant",
        populate: {
          path: "productId",
          select: "name thumbnail slug vendorId vendorLocation",
        },
      })
      .lean();

    if (!cart) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    // 3. Distance Function
    const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
      const toRad = (val) => (val * Math.PI) / 180;
      const R = 6371;

      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    // 4. Build Response
    const itemsWithDistance = cart.items
      .filter((item) => item.variant && item.variant.productId)
      .map((item) => {
        const product = item.variant.productId;
        const vendorLocation = product.vendorLocation;

        let distance = 0;

        if (vendorLocation && vendorLocation.coordinates) {
          const [vendorLng, vendorLat] = vendorLocation.coordinates;

          distance = getDistanceInKm(vendorLat, vendorLng, userLat, userLng);
        }

        return {
          itemId: item._id,
          productId: product._id,
          name: product.name,
          thumbnail: product.thumbnail,
          quantity: item.quantity,
          distance: Math.round(distance), // KM
        };
      });

    return res.status(200).json({
      success: true,
      message: "Cart with distances",
      items: itemsWithDistance,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const checkoutPreview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;

    if (!addressId) {
      throw new APIError(400, "addressId is required");
    }

    // user selected address check
    const address = await Address.findOne({
      _id: addressId,
      userId,
    });

    if (!address) {
      throw new APIError(404, "Address not found");
    }

    // get cart
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.variant",
      populate: {
        path: "productId",
        model: "Product",
        select: `
          name
          slug
          images
          serviceableDeliveryPincode
          deliveryOptions
          deliveryCharges
          shippingCharges
          vendorLocation
        `,
      },
    });

    if (!cart || !cart.items.length) {
      throw new APIError(400, "Cart is empty");
    }

    const responseItems = [];

    for (const item of cart.items) {
      const variant = item.variant;
      const product = variant.productId;

      let availableDeliveryTypes = ["self", "logistic"];

      // vendor delivery check by pincode
      const isVendorAvailable = product.serviceableDeliveryPincode?.includes(
        String(address.pincode),
      );

      if (isVendorAvailable) {
        availableDeliveryTypes.push("vendor");
      }

      responseItems.push({
        itemId: item._id,
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        availableDeliveryTypes,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Select delivery type for products",
      address: {
        addressId: address._id,
        pincode: address.pincode,
      },
      items: responseItems,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// METHOD 2: SELECT DELIVERY TYPE → SHOW DELIVERY FEE
// ============================================

export const calculateDeliveryFee = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { addressId, items } = req.body;

    /**
     * req.body
     *
     * {
     *   "addressId": "...",
     *   "items": [
     *     {
     *       "variantId": "...",
     *       "deliveryType": "vendor"
     *     }
     *   ]
     * }
     */

    if (!addressId || !items?.length) {
      throw new APIError(400, "addressId and items are required");
    }

    const address = await Address.findOne({
      _id: addressId,
      userId,
    });

    if (!address) {
      throw new APIError(404, "Address not found");
    }
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.variant",
      populate: {
        path: "productId",
        model: "Product",
        select: `
      name images
      shippingCharges
      deliveryCharges
      vendorLocation
      vendorId
      deliveryOptions
      serviceableDeliveryPincode
        `,
      },
    });

    if (!cart || !cart.items.length) {
      throw new APIError(400, "Cart is empty");
    }

    let subtotal = 0;
    let totalDeliveryFee = 0;
    const finalItems = [];

    for (const cartItem of cart.items) {
      const variant = cartItem.variant;
      const product = variant.productId;
      const selected = items.find(
        (i) => i.variantId === variant._id.toString(),
      );

      if (!selected) continue;

      const itemTotal = cartItem.quantity * cartItem.unitPrice;
      subtotal += itemTotal;
      const result = await calculateSingleItemDeliveryFee({
        product,
        variant,
        quantity: cartItem.quantity,
        userAddress: address.location,
        deliveryType: selected.deliveryType,
      });
      totalDeliveryFee += result.deliveryFee;

      finalItems.push({
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        vendorId: product.vendorId,
        productImage: product.images,
        quantity: cartItem.quantity,
        itemTotal,
        deliveryType: selected.deliveryType,
        durationTime: result.duration,

        distance: {
          km: result.distanceKm || 0,
          meter: result.distanceMeter || 0,
        },
        deliveryFee: result.deliveryFee,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery fee calculated successfully",

      billSummary: {
        subtotal,
        deliveryFee: totalDeliveryFee,
        grandTotal: subtotal + totalDeliveryFee,
      },
      items: finalItems,
    });
  } catch (error) {
    next(error);
  }
};

import { VendorCompany } from "../../models/vendorShop/vendor.model.js";
import logger from "../../utils/logger.js";

export const calculateSingleItemDeliveryFee = async ({
  product,
  variant,
  quantity,
  userAddress,
  deliveryType,
}) => {
  let deliveryFee = 0;
  let distanceKm = 0;
  let distanceMeter = 0;
  let duration = "";

  // self pickup
  if (deliveryType === "self") {
    return {
      deliveryFee: 0,
      distanceKm,
      distanceMeter,
      duration,
    };
  }

  // free delivery
  if (product.deliveryCharges === "free") {
    return {
      deliveryFee: 0,
      distanceKm,
      distanceMeter,
      duration,
    };
  }

  const shipping = product.shippingCharges || {};

  // =========================
  // vendor company location fetch
  // =========================

  const vendorCompany = await VendorCompany.findOne({
    vendorId: product.vendorId,
  })
    .select("businessAddress")
    .lean();

  let vendorLat = null;
  let vendorLng = null;

  if (
    vendorCompany?.businessAddress?.latitude &&
    vendorCompany?.businessAddress?.longitude
  ) {
    vendorLat = vendorCompany.businessAddress.latitude;
    vendorLng = vendorCompany.businessAddress.longitude;
  }

  let userCoordinates = [userAddress.lng, userAddress.lat];

  if (
    vendorLat !== null &&
    vendorLng !== null &&
    userCoordinates.length === 2
  ) {
    const roadDistance = await getDistanceInKm(
      vendorLat,
      vendorLng,
      userCoordinates[1], // lat
      userCoordinates[0], // lng
    );

    // distanceMeter = Math.round(distanceKm * 1000);
    // distanceKm = Number(distanceKm.toFixed(2));

    distanceKm = roadDistance.distanceKm;
    distanceMeter = roadDistance.distanceMeter;
    duration = roadDistance.durationText || "";
  }

  // =========================
  // measurementUnit based logic
  // =========================

  // switch (product.measurementUnit) {
  //   case "kg":
  //     deliveryFee =
  //       Number(shipping.fixed || 0) +
  //       Number(distanceKm * (shipping.distancePerKm || 0)) +
  //       Number(
  //         (variant.packageWeight || 0) * quantity * (shipping.weightPerKg || 0),
  //       );
  //     break;

  //   case "cubicmeter":
  //     deliveryFee =
  //       Number(shipping.fixed || 0) +
  //       Number(distanceKm * (shipping.distancePerKm || 0)) +
  //       Number(quantity * (shipping.volumePerCubicMeter || 0));
  //     break;

  //   case "meter":
  //   case "supermeter":
  //     deliveryFee =
  //       Number(shipping.fixed || 0) +
  //       Number(distanceKm * (shipping.distancePerKm || 0)) +
  //       Number(quantity * (shipping.perMeterCharge || 0));
  //     break;

  //   default:
  //     deliveryFee =
  //       Number(shipping.fixed || 0) +
  //       Number(distanceKm * (shipping.distancePerKm || 0)) +
  //       Number(quantity * (shipping.perPieceCharge || 0));
  // }

  switch (product.measurementUnit) {
    case "kg":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(
          (variant.packageWeight || 0) *
            quantity *
            Number(shipping.weightPerKg || 0),
        );
      break;

    case "liter":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perLiterCharge || 0));
      break;

    case "meter":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perMeterCharge || 0));
      break;

    case "supermeter":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perSuperMeterCharge || 0));
      break;

    case "cubicmeter":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perCubicMeterCharge || 0));
      break;

    case "box":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perBoxCharge || 0));
      break;

    case "set":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perSetCharge || 0));
      break;

    case "roll":
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perRollCharge || 0));
      break;

    case "piece":
    default:
      deliveryFee =
        Number(shipping.fixed || 0) +
        Number(distanceKm * Number(shipping.distancePerKm || 0)) +
        Number(quantity * Number(shipping.perPieceCharge || 0));
      break;
  }

  return {
    deliveryFee: Math.round(deliveryFee),
    distanceKm,
    distanceMeter,
    duration,
  };
};
