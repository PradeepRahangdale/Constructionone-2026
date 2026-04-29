import mongoose from "mongoose";
import Order from "../../models/marketPlace/order.model.js";
import Cart from "../../models/user/cart.model.js";
import Product from "../../models/vendorShop/product.model.js";
import Variant from "../../models/vendorShop/variant.model.js";
import Wallet from "../../models/user/wallet.model.js";
import Transaction from "../../models/user/transaction.model.js";
import { APIError } from "../../middlewares/errorHandler.js";
import crypto from "crypto";
import redis from "../../config/redis.config.js";
import {
  sendOrderNotificationToUser,
  sendOrderNotificationToVendor,
} from "../notification.controller.js";
import { VendorCompany } from "../../models/vendorShop/vendor.model.js";
//latest-with all details

// export const getOrdersByVendor = async (req, res, next) => {
//   try {
//     const vendorId = req.params.vendorId;
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const version = (await redis.get(`vendor:orders:version:${vendorId}`)) || 1;
//     const cacheKey = `orders:vendor:${vendorId}:v${version}:${JSON.stringify(
//       req.query,
//     )}`;

//     const cached = await redis.get(cacheKey);
//     if (cached) {
//       return res.status(200).json(JSON.parse(cached));
//     }

//     const filter = {
//       "items.vendorId": vendorId,
//       orderType: "SUB",
//     };

//     if (req.query.status) {
//       filter.status = req.query.status;
//     }

//     if (req.query.paymentStatus) {
//       filter.paymentStatus = req.query.paymentStatus;
//     }

//     const statsFilter = {
//       "items.vendorId": new mongoose.Types.ObjectId(vendorId),
//       orderType: "SUB",
//     };

//     const [orders, total, revenueResult, pendingCount] = await Promise.all([
//       Order.find(filter)
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .populate({
//           path: "items.productId",
//           select: `
//     name
//     images
//     categoryId
//     pcategoryId
//     subcategoryId
//     productTypeId
//     brandId
//   `,
//           populate: [
//             {
//               path: "categoryId",
//               select: "name",
//             },
//             {
//               path: "pcategoryId",
//               select: "name",
//             },
//             {
//               path: "subcategoryId",
//               select: "name",
//             },
//             {
//               path: "productTypeId",
//               select: "typeName",
//             },
//             {
//               path: "brandId",
//               select: "name",
//             },
//           ],
//         })
//         .populate({
//           path: "items.variantId",
//           select: "price packageWeight packageDimensions",
//         })
//         .populate({
//           path: "userId",
//           select: "name email phone",
//         })
//         .populate({
//           path: "shippingAddressId",
//           select:
//             "label userName addressLine country city state pincode landMark",
//         })
//         .lean(),

//       Order.countDocuments(filter),

//       Order.aggregate([
//         {
//           $match: {
//             ...statsFilter,
//             paymentStatus: "PAID",
//             status: "DELIVERED",
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             totalRevenue: {
//               $sum: "$netAmount",
//             },
//           },
//         },
//       ]),

//       Order.countDocuments({
//         ...statsFilter,
//         status: "PENDING",
//       }),
//     ]);

//     const totalRevenue = revenueResult[0]?.totalRevenue || 0;

//     const response = {
//       success: true,
//       message: "Vendor orders fetched successfully",
//       stats: {
//         totalRevenue,
//         pendingCount,
//       },
//       data: {
//         orders,
//         pagination: {
//           total,
//           page,
//           limit,
//           totalPages: Math.ceil(total / limit),
//         },
//       },
//     };
//     await redis.set(cacheKey, JSON.stringify(response), "EX", 300);
//     return res.status(200).json(response);
//   } catch (error) {
//     next(error);
//   }
// };

//get single order with details
export const getOrderByIdForVendor = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const orderId = req.params.orderId;

    const version = (await redis.get(`vendor:orders:version:${vendorId}`)) || 1;

    const cacheKey = `orders:vendor:${vendorId}:v${version}:${JSON.stringify(
      req.query,
    )}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    const filter = {
      "items.vendorId": vendorId,
      orderType: "SUB",
      _id: new mongoose.Types.ObjectId(orderId),
    };

    const statsFilter = {
      "items.vendorId": new mongoose.Types.ObjectId(vendorId),
      orderType: "SUB",
    };

    const [orders] = await Promise.all([
      Order.find(filter)
        .populate({
          path: "items.productId",
          select: `
    name
    images
    categoryId
    pcategoryId
    subcategoryId
    productTypeId
    brandId
  `,
          populate: [
            {
              path: "categoryId",
              select: "name",
            },
            {
              path: "pcategoryId",
              select: "name",
            },
            {
              path: "subcategoryId",
              select: "name",
            },
            {
              path: "productTypeId",
              select: "typeName",
            },
            {
              path: "brandId",
              select: "name",
            },
          ],
        })
        .populate({
          path: "items.variantId",
          select: "price packageWeight packageDimensions sold quantity",
        })
        .populate({
          path: "userId",
          select: "name email phone",
        })
        .populate({
          path: "shippingAddressId",
          select:
            "label userName addressLine country city state pincode landMark",
        })
        .lean(),
    ]);
    const response = {
      success: true,
      message: "Vendor orders fetched successfully",
      data: {
        orders,
      },
    };
    // await redis.set(cacheKey, JSON.stringify(response), "EX", 300);
    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

//get all orders for vendor screen
export const getAllOrdersForVendor = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    const version = (await redis.get(`vendor:orders:version:${vendorId}`)) || 1;

    const cacheKey = `orders:vendor:${vendorId}:v${version}:${JSON.stringify(
      req.query,
    )}`;

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return res.status(200).json(JSON.parse(cached));
    // }

    // base filter
    const filter = {
      "items.vendorId": vendorId,
      orderType: "SUB",
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.paymentStatus) {
      filter.paymentStatus = req.query.paymentStatus;
    }

    // search filter
    if (search) {
      filter.$or = [
        {
          orderId: {
            $regex: search,
            $options: "i",
          },
        },
        {
          "items.productName": {
            $regex: search,
            $options: "i",
          },
        },
        {
          status: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const allStatusesFromModel = Order.schema.path("status").enumValues || [];
    const allStatuses = ["ALL", ...allStatusesFromModel];

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          `
            orderId
            status
            paymentStatus
            netAmount
            createdAt
            items
            userId
          `,
        )
        .populate({
          path: "items.productId",
          select: "name images",
        })
        .populate({
          path: "userId",
          select: "name phone",
        })
        .lean(),
    ]);

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.netAmount,
      createdAt: order.createdAt,

      customer: {
        name: order.userId?.name || "",
        phone: order.userId?.phone || "",
      },

      totalItems: order.items?.length || 0,

      products:
        order.items?.slice(0, 2).map((item) => ({
          productName: item.productId?.name || item.productName,
          image: item.productId?.images?.[0] || "",
          quantity: item.quantity,
        })) || [],
    }));

    const response = {
      success: true,
      message: "Vendor orders fetched successfully",

      filters: {
        statuses: allStatuses || [],
      },

      data: {
        orders: formattedOrders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };

    await redis.set(cacheKey, JSON.stringify(response), "EX", 300);

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

//dashboard-overview
export const getVendorOverview = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    let { date } = req.query;

    if (!date) {
      const today = new Date();
      date = today.toISOString().split("T")[0];
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    const baseMatch = {
      "items.vendorId": vendorObjectId,
      orderType: "SUB",
    };

    const dateFilter = {
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    };

    // 1. Total Earnings
    const earningsRes = await Order.aggregate([
      {
        $match: {
          ...baseMatch,
          ...dateFilter,
          paymentStatus: "PAID",
          status: "DELIVERED",
        },
      },
      { $group: { _id: null, totalEarnings: { $sum: "$netAmount" } } },
    ]);

    // 2. Pending Orders
    const pendingRes = await Order.aggregate([
      { $match: { ...baseMatch, ...dateFilter, status: "PENDING" } },
      { $count: "count" },
    ]);

    // 3. Total Orders on selected date
    const totalOrdersRes = await Order.aggregate([
      { $match: { ...baseMatch, ...dateFilter } },
      { $count: "count" },
    ]);

    // 4. Total Unique Products (overall)
    const productsRes = await Order.aggregate([
      { $match: baseMatch },
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorObjectId } },
      { $group: { _id: "$items.productId" } },
      { $count: "count" },
    ]);

    // 5. Recent Orders
    const recentOrders = await Order.find({ ...baseMatch, ...dateFilter })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("items.productId", "name images")
      .populate(
        "items.variantId",
        "price size packageWeight packageDimensions stock sold",
      )
      .populate("userId", "name")
      .lean();

    // 6. Low Stock Variants (Fixed - ab Variant mein vendorId ki zarurat nahi)
    const lowStock = await Order.aggregate([
      { $match: baseMatch }, // is vendor ke saare orders
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorObjectId } },
      {
        $lookup: {
          from: "variants", // apna Variant collection ka naam yahan daalo (agar alag hai to change karo)
          localField: "items.variantId",
          foreignField: "_id",
          as: "variant",
        },
      },
      { $unwind: { path: "$variant", preserveNullAndEmptyArrays: true } },
      { $match: { "variant.stock": { $lt: 10 } } }, // stock < 10
      {
        $group: {
          _id: "$items.variantId",
          productId: { $first: "$items.productId" },
          variant: { $first: "$variant" },
        },
      },
      { $sort: { "variant.stock": 1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId: "$product._id",
          productName: "$product.name",
          productImage: { $arrayElemAt: ["$product.images", 0] },
          variantId: "$_id",
          size: "$variant.size",
          packageWeight: "$variant.packageWeight",
          stock: "$variant.stock",
          sold: "$variant.sold",
        },
      },
    ]);

    // 7. Popular Products (selected date)
    const popularRes = await Order.aggregate([
      {
        $match: {
          ...baseMatch,
          ...dateFilter,
          status: { $in: ["DELIVERED", "CONFIRMED"] },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.vendorId": vendorObjectId } },
      {
        $group: {
          _id: "$items.productId",
          soldCount: { $sum: "$items.quantity" },
          totalSalesValue: {
            $sum: { $multiply: ["$items.finalPrice", "$items.quantity"] },
          },
        },
      },
      { $sort: { soldCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId: "$_id",
          productName: "$product.name",
          productImage: { $arrayElemAt: ["$product.images", 0] },
          soldCount: 1,
          totalSalesValue: 1,
        },
      },
    ]);
    const response = {
      success: true,
      message: "Vendor overview fetched successfully",
      selectedDate: date,
      data: {
        totalEarnings: earningsRes[0]?.totalEarnings || 0,
        pendingOrders: pendingRes[0]?.count || 0,
        todayOrders: totalOrdersRes[0]?.count || 0,
        totalProducts: productsRes[0]?.count || 0,

        recentOrders: recentOrders || [],
        lowStockVariants: lowStock || [],
        popularProducts: popularRes || [],
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    // console.error("Vendor Overview Error:", error);
    next(error);
  }
};
