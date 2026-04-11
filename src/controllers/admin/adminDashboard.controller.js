// import User from "../../models/user/user.model.js";
// import { VendorProfile } from "../../models/vendorShop/vendor.model.js";
// import { APIError, catchAsync } from "../../middlewares/errorHandler.js";
// import { ApiResponse } from "../../utils/ApiResponse.js";
// import mongoose from "mongoose";
// import Order from "../../models/marketPlace/order.model.js";
// import City from "../../models/admin/city.model.js";
// import State from "../../models/admin/state.model.js";
// import Country from "../../models/admin/country.model.js";
// import Pincode from "../../models/admin/pincode.model.js";
// import RedisCache from "../../utils/redisCache.js";
// import Pcategory from "../../models/category/pcategory.model.js";
// import Category from "../../models/category/category.model.js";
// import SubCategory from "../../models/category/subCategory.model.js";
// // GET /admin/dashboard-data

// export const getAdminDashboardData = catchAsync(async (req, res, next) => {
//   let { year, from, to } = req.query;
//   let startDate, endDate;
//   if (from && to) {
//     startDate = new Date(from);
//     endDate = new Date(to);
//     endDate.setDate(endDate.getDate() + 1);
//   } else {
//     year = year ? parseInt(year) : new Date().getFullYear();
//     startDate = new Date(year, 0, 1);
//     endDate = new Date(year + 1, 0, 1);
//   }

//   // Parallelize all simple counts
//   const [
//     totalVerifiedVendors,
//     totalUnverifiedVendors,
//     totalUsers,
//     totalCities,
//     totalStates,
//     totalCountries,
//     totalPincodes,
//     totalPCategories,
//     totalCategories,
//     totalSubCategories,
//     totalTransactions,
//   ] = await Promise.all([
//     VendorProfile.countDocuments({ isAdminVerified: true }),
//     VendorProfile.countDocuments({ isAdminVerified: false }),
//     User.countDocuments(),
//     City.countDocuments(),
//     State.countDocuments(),
//     Country.countDocuments(),
//     Pincode.countDocuments(),
//     Pcategory.countDocuments(),
//     Category.countDocuments(),
//     SubCategory.countDocuments(),
//     (async () => {
//       try {
//         const Transaction = (
//           await import("../../models/marketPlace/transaction.model.js")
//         ).default;
//         return await Transaction.countDocuments();
//       } catch {
//         return 0;
//       }
//     })(),
//   ]);

//   // Orders by status (parallel)
//   const orderStatuses = ["DELIVERED", "CANCELLED", "PENDING"];
//   const ordersByStatusArr = await Promise.all(
//     orderStatuses.map((status) =>
//       Order.countDocuments({
//         "items.status": status,
//         createdAt: { $gte: startDate, $lt: endDate },
//       }),
//     ),
//   );
//   const ordersByStatus = Object.fromEntries(
//     orderStatuses.map((s, i) => [s, ordersByStatusArr[i]]),
//   );

//   // Aggregations (run in parallel)
//   const [
//     totalAmountAgg,
//     turnoverAgg,
//     ordersByMonthAgg,
//     usersByMonthAgg,
//     vendorsByMonthAgg,
//   ] = await Promise.all([
//     Order.aggregate([
//       { $unwind: "$items" },
//       {
//         $match: {
//           "items.status": "DELIVERED",
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: null,
//           total: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
//         },
//       },
//     ]),
//     Order.aggregate([
//       { $unwind: "$items" },
//       {
//         $match: {
//           "items.status": "DELIVERED",
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: null,
//           turnover: {
//             $sum: { $multiply: ["$items.price", "$items.quantity"] },
//           },
//         },
//       },
//     ]),
//     Order.aggregate([
//       { $unwind: "$items" },
//       { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
//       {
//         $group: {
//           _id: { month: { $month: "$createdAt" }, status: "$items.status" },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]),
//     User.aggregate([
//       { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
//       {
//         $group: {
//           _id: { month: { $month: "$createdAt" } },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]),
//     VendorProfile.aggregate([
//       { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
//       {
//         $group: {
//           _id: { month: { $month: "$createdAt" } },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]),
//   ]);

//   const totalAmount = totalAmountAgg[0]?.total || 0;
//   const turnover = turnoverAgg[0]?.turnover || 0;

//   // Format ordersByMonth
//   const ordersByMonth = {};
//   for (let i = 1; i <= 12; i++) {
//     ordersByMonth[i] = { DELIVERED: 0, CANCELLED: 0, PENDING: 0 };
//   }
//   for (const item of ordersByMonthAgg) {
//     const m = item._id.month;
//     const s = item._id.status;
//     if (ordersByMonth[m] && ordersByMonth[m][s] !== undefined) {
//       ordersByMonth[m][s] = item.count;
//     }
//   }

//   // Format usersByMonth
//   const usersByMonth = {};
//   for (let i = 1; i <= 12; i++) usersByMonth[i] = 0;
//   for (const item of usersByMonthAgg) {
//     usersByMonth[item._id.month] = item.count;
//   }

//   // Format vendorsByMonth
//   const vendorsByMonth = {};
//   for (let i = 1; i <= 12; i++) vendorsByMonth[i] = 0;
//   for (const item of vendorsByMonthAgg) {
//     vendorsByMonth[item._id.month] = item.count;
//   }

//   const responseData = {
//     ordersByStatus,
//     totalAmount,
//     turnover,
//     totalVerifiedVendors,
//     totalUnverifiedVendors,
//     totalUsers,
//     totalCities,
//     totalStates,
//     totalCountries,
//     totalPincodes,
//     totalPCategories,
//     totalCategories,
//     totalSubCategories,
//     ordersByMonth,
//     usersByMonth,
//     vendorsByMonth,
//     totalTransactions,
//     dateRange: { from: startDate, to: endDate },
//   };
//   if (!req.query.from && !req.query.to) {
//     await RedisCache.set(`admin_dashboard_${year}`, responseData, 300);
//   }
//   return res.json(
//     new ApiResponse(
//       200,
//       responseData,
//       "Admin dashboard data fetched successfully",
//     ),
//   );
// });

// import User from "../../models/user/user.model.js";
// import { VendorProfile } from "../../models/vendorShop/vendor.model.js";
// import { APIError, catchAsync } from "../../middlewares/errorHandler.js";
// import { ApiResponse } from "../../utils/ApiResponse.js";
// import mongoose from "mongoose";
// import Order from "../../models/marketPlace/order.model.js";
// import City from "../../models/admin/city.model.js";
// import State from "../../models/admin/state.model.js";
// import Country from "../../models/admin/country.model.js";
// import Pincode from "../../models/admin/pincode.model.js";
// import RedisCache from "../../utils/redisCache.js";
// import Pcategory from "../../models/category/pcategory.model.js";
// import Category from "../../models/category/category.model.js";
// import SubCategory from "../../models/category/subCategory.model.js";
// import Brand from "../../models/vendorShop/brand.model.js";

// // GET /admin/dashboard-data
// export const getAdminDashboardData = catchAsync(async (req, res, next) => {
//   let { year, from, to, moduleId } = req.query;

//   // ✅ Validate moduleId
//   if (!moduleId || !mongoose.Types.ObjectId.isValid(moduleId)) {
//     return next(new APIError(400, "Valid moduleId is required"));
//   }

//   const MODULE_ID = new mongoose.Types.ObjectId(moduleId);

//   let startDate, endDate;

//   if (from && to) {
//     startDate = new Date(from);
//     endDate = new Date(to);
//     endDate.setDate(endDate.getDate() + 1);
//   } else {
//     year = year ? parseInt(year) : new Date().getFullYear();
//     startDate = new Date(year, 0, 1);
//     endDate = new Date(year + 1, 0, 1);
//   }

//   // ✅ PARALLEL COUNTS
//   const [
//     totalVerifiedVendors,
//     totalUnverifiedVendors,
//     totalUsers,
//     totalCities,
//     totalStates,
//     totalCountries,
//     totalPincodes,
//     totalPCategories,
//     totalCategories,
//     totalSubCategories,
//     totalTransactions,
//     totalBrands,
//   ] = await Promise.all([
//     VendorProfile.countDocuments({
//       moduleId: MODULE_ID,
//       isAdminVerified: true,
//     }),
//     VendorProfile.countDocuments({
//       moduleId: MODULE_ID,
//       isAdminVerified: false,
//     }),
//     User.countDocuments({ moduleId: MODULE_ID }),
//     City.countDocuments(),
//     State.countDocuments(),
//     Country.countDocuments(),
//     Pincode.countDocuments(),
//     Pcategory.countDocuments(),
//     Category.countDocuments(),
//     SubCategory.countDocuments(),
//     (async () => {
//       try {
//         const Transaction = (
//           await import("../../models/marketPlace/transaction.model.js")
//         ).default;
//         return await Transaction.countDocuments({ moduleId: MODULE_ID });
//       } catch {
//         return 0;
//       }
//     })(),
//     Brand.countDocuments({ moduleId: MODULE_ID }),
//   ]);

//   // ✅ Orders by status
//   const orderStatuses = ["DELIVERED", "CANCELLED", "PENDING"];

//   const ordersByStatusArr = await Promise.all(
//     orderStatuses.map((status) =>
//       Order.countDocuments({
//         moduleId: MODULE_ID,
//         "items.status": status,
//         createdAt: { $gte: startDate, $lt: endDate },
//       })
//     )
//   );

//   const ordersByStatus = Object.fromEntries(
//     orderStatuses.map((s, i) => [s, ordersByStatusArr[i]])
//   );

//   // ✅ Aggregations
//   const [
//     totalAmountAgg,
//     turnoverAgg,
//     ordersByMonthAgg,
//     usersByMonthAgg,
//     vendorsByMonthAgg,
//   ] = await Promise.all([
//     // Total Amount
//     Order.aggregate([
//       { $match: { moduleId: MODULE_ID } },
//       { $unwind: "$items" },
//       {
//         $match: {
//           "items.status": "DELIVERED",
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: null,
//           total: {
//             $sum: { $multiply: ["$items.price", "$items.quantity"] },
//           },
//         },
//       },
//     ]),

//     // Turnover
//     Order.aggregate([
//       { $match: { moduleId: MODULE_ID } },
//       { $unwind: "$items" },
//       {
//         $match: {
//           "items.status": "DELIVERED",
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: null,
//           turnover: {
//             $sum: { $multiply: ["$items.price", "$items.quantity"] },
//           },
//         },
//       },
//     ]),

//     // Orders by Month
//     Order.aggregate([
//       { $match: { moduleId: MODULE_ID } },
//       { $unwind: "$items" },
//       {
//         $match: {
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: {
//             month: { $month: "$createdAt" },
//             status: "$items.status",
//           },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]),

//     // Users by Month
//     User.aggregate([
//       {
//         $match: {
//           moduleId: MODULE_ID,
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: { month: { $month: "$createdAt" } },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]),

//     // Vendors by Month
//     VendorProfile.aggregate([
//       {
//         $match: {
//           moduleId: MODULE_ID,
//           createdAt: { $gte: startDate, $lt: endDate },
//         },
//       },
//       {
//         $group: {
//           _id: { month: { $month: "$createdAt" } },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]),
//   ]);

//   const totalAmount = totalAmountAgg[0]?.total || 0;
//   const turnover = turnoverAgg[0]?.turnover || 0;

//   // ✅ Format ordersByMonth
//   const ordersByMonth = {};
//   for (let i = 1; i <= 12; i++) {
//     ordersByMonth[i] = { DELIVERED: 0, CANCELLED: 0, PENDING: 0 };
//   }

//   for (const item of ordersByMonthAgg) {
//     const m = item._id.month;
//     const s = item._id.status;
//     if (ordersByMonth[m] && ordersByMonth[m][s] !== undefined) {
//       ordersByMonth[m][s] = item.count;
//     }
//   }

//   // ✅ Users by Month
//   const usersByMonth = {};
//   for (let i = 1; i <= 12; i++) usersByMonth[i] = 0;

//   for (const item of usersByMonthAgg) {
//     usersByMonth[item._id.month] = item.count;
//   }

//   // ✅ Vendors by Month
//   const vendorsByMonth = {};
//   for (let i = 1; i <= 12; i++) vendorsByMonth[i] = 0;

//   for (const item of vendorsByMonthAgg) {
//     vendorsByMonth[item._id.month] = item.count;
//   }

//   // ✅ Final response
//   const responseData = {
//     ordersByStatus,
//     totalAmount,
//     turnover,
//     totalVerifiedVendors,
//     totalUnverifiedVendors,
//     totalUsers,
//     totalCities,
//     totalStates,
//     totalCountries,
//     totalPincodes,
//     totalPCategories,
//     totalCategories,
//     totalSubCategories,
//     totalBrands,
//     ordersByMonth,
//     usersByMonth,
//     vendorsByMonth,
//     totalTransactions,
//     dateRange: { from: startDate, to: endDate },
//   };

//   // ✅ Redis cache
//   if (!from && !to) {
//     await RedisCache.set(
//       `admin_dashboard_${moduleId}_${year}`,
//       responseData,
//       300
//     );
//   }

//   return res.json(
//     new ApiResponse(
//       200,
//       responseData,
//       "Admin dashboard data fetched successfully"
//     )
//   );
// });

import User from "../../models/user/user.model.js";
import { VendorProfile } from "../../models/vendorShop/vendor.model.js";
import { APIError, catchAsync } from "../../middlewares/errorHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import mongoose from "mongoose";
import Order from "../../models/marketPlace/order.model.js";
import City from "../../models/admin/city.model.js";
import State from "../../models/admin/state.model.js";
import Country from "../../models/admin/country.model.js";
import Pincode from "../../models/admin/pincode.model.js";
import RedisCache from "../../utils/redisCache.js";
import Pcategory from "../../models/category/pcategory.model.js";
import Category from "../../models/category/category.model.js";
import SubCategory from "../../models/category/subCategory.model.js";
import Brand from "../../models/vendorShop/brand.model.js";
import Product from "../../models/vendorShop/product.model.js";

// GET /admin/material-dashboard
export const getAdminDashboardData = catchAsync(async (req, res, next) => {
  let { year, from, to, moduleId } = req.query;

  if (!moduleId || !mongoose.Types.ObjectId.isValid(moduleId)) {
    return next(new APIError(400, "Valid moduleId is required"));
  }

  const MODULE_ID = new mongoose.Types.ObjectId(moduleId);

  let startDate, endDate;

  if (from && to) {
    startDate = new Date(from);
    endDate = new Date(to);
    endDate.setDate(endDate.getDate() + 1);
  } else {
    year = year ? parseInt(year) : new Date().getFullYear();
    startDate = new Date(year, 0, 1);
    endDate = new Date(year + 1, 0, 1);
  }

  // ✅ PARALLEL COUNTS
  const [
    totalUsers,
    totalVendors,
    verifiedVendors,
    unverifiedVendors,
    totalProducts,
    totalBrands,
    inStock,
    outOfStock,
    totalCities,
    totalStates,
    totalCountries,
    totalPincodes,
    totalPCategories,
    totalCategories,
    totalSubCategories,
    totalTransactions,
  ] = await Promise.all([
    User.countDocuments({ moduleId: MODULE_ID }),

    VendorProfile.countDocuments({ moduleId: MODULE_ID }),
    VendorProfile.countDocuments({
      moduleId: MODULE_ID,
      isAdminVerified: true,
    }),
    VendorProfile.countDocuments({
      moduleId: MODULE_ID,
      isAdminVerified: false,
    }),

    Product.countDocuments({ moduleId: MODULE_ID }),
    Brand.countDocuments({ moduleId: MODULE_ID }),

    Product.countDocuments({ moduleId: MODULE_ID, stock: { $gt: 0 } }),
    Product.countDocuments({ moduleId: MODULE_ID, stock: { $lte: 0 } }),

    City.countDocuments(),
    State.countDocuments(),
    Country.countDocuments(),
    Pincode.countDocuments(),

    Pcategory.countDocuments(),
    Category.countDocuments(),
    SubCategory.countDocuments(),

    (async () => {
      try {
        const Transaction = (
          await import("../../models/marketPlace/transaction.model.js")
        ).default;
        return await Transaction.countDocuments({ moduleId: MODULE_ID });
      } catch {
        return 0;
      }
    })(),
  ]);

  // ✅ ORDER STATUS
  const statuses = ["DELIVERED", "PENDING", "CANCELLED"];

  const ordersStatusArr = await Promise.all(
    statuses.map((status) =>
      Order.countDocuments({
        moduleId: MODULE_ID,
        "items.status": status,
        createdAt: { $gte: startDate, $lt: endDate },
      }),
    ),
  );

  const ordersByStatus = Object.fromEntries(
    statuses.map((s, i) => [s, ordersStatusArr[i]]),
  );

  const totalOrders =
    ordersByStatus.DELIVERED +
    ordersByStatus.PENDING +
    ordersByStatus.CANCELLED;

  // ✅ AGGREGATIONS
  const [
    totalAmountAgg,
    ordersByMonthAgg,
    usersByMonthAgg,
    vendorsByMonthAgg,
    revenueByMonthAgg,
    topProductsAgg,
    topVendorsAgg,
    latestOrders,
  ] = await Promise.all([
    // Total Amount
    Order.aggregate([
      { $match: { moduleId: MODULE_ID } },
      { $unwind: "$items" },
      {
        $match: {
          "items.status": "DELIVERED",
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] },
          },
        },
      },
    ]),

    // Orders by Month
    Order.aggregate([
      { $match: { moduleId: MODULE_ID } },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            status: "$items.status",
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // Users by Month
    User.aggregate([
      { $match: { moduleId: MODULE_ID } },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),

    // Vendors by Month
    VendorProfile.aggregate([
      { $match: { moduleId: MODULE_ID } },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),

    // Revenue by Month
    Order.aggregate([
      { $match: { moduleId: MODULE_ID } },
      { $unwind: "$items" },
      {
        $match: { "items.status": "DELIVERED" },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          revenue: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] },
          },
        },
      },
    ]),

    // Top Products
    Order.aggregate([
      { $match: { moduleId: MODULE_ID } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          sold: { $sum: "$items.quantity" },
        },
      },
      { $sort: { sold: -1 } },
      { $limit: 5 },
    ]),

    // Top Vendors
    Order.aggregate([
      { $match: { moduleId: MODULE_ID } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.vendorId",
          totalSales: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] },
          },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 5 },
    ]),

    // Latest Orders
    Order.find({ moduleId: MODULE_ID })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("_id totalAmount status createdAt"),
  ]);

  const totalAmount = totalAmountAgg[0]?.total || 0;

  // ✅ FORMAT MONTH DATA
  const ordersByMonth = {};
  const revenueByMonth = {};
  const usersByMonth = {};
  const vendorsByMonth = {};

  for (let i = 1; i <= 12; i++) {
    ordersByMonth[i] = { DELIVERED: 0, PENDING: 0, CANCELLED: 0 };
    revenueByMonth[i] = 0;
    usersByMonth[i] = 0;
    vendorsByMonth[i] = 0;
  }

  ordersByMonthAgg.forEach((item) => {
    ordersByMonth[item._id.month][item._id.status] = item.count;
  });

  revenueByMonthAgg.forEach((item) => {
    revenueByMonth[item._id.month] = item.revenue;
  });

  usersByMonthAgg.forEach((item) => {
    usersByMonth[item._id.month] = item.count;
  });

  vendorsByMonthAgg.forEach((item) => {
    vendorsByMonth[item._id.month] = item.count;
  });

  // ✅ FINAL RESPONSE
  const responseData = {
    summary: {
      totalOrders,
      deliveredOrders: ordersByStatus.DELIVERED,
      pendingOrders: ordersByStatus.PENDING,
      cancelledOrders: ordersByStatus.CANCELLED,

      totalUsers,

      totalVendors,
      verifiedVendors,
      unverifiedVendors,

      totalProducts,
      totalBrands,

      totalAmount,
      yearlyTurnover: totalAmount,

      totalTransactions,
    },

    analytics: {
      ordersByMonth,
      revenueByMonth,
      usersByMonth,
      vendorsByMonth,
    },

    inventory: {
      totalProducts,
      inStock,
      outOfStock,
    },

    categories: {
      totalPCategories,
      totalCategories,
      totalSubCategories,
    },

    location: {
      totalCities,
      totalStates,
      totalCountries,
      totalPincodes,
    },

    recentActivity: {
      latestOrders,
      topSellingProducts: topProductsAgg,
      topVendors: topVendorsAgg,
    },

    dateRange: {
      from: startDate,
      to: endDate,
    },
  };

  // ✅ REDIS CACHE
  if (!from && !to) {
    await RedisCache.set(
      `material_dashboard_${moduleId}_${year}`,
      responseData,
      300,
    );
  }

  return res.json(
    new ApiResponse(
      200,
      responseData,
      "Material dashboard data fetched successfully",
    ),
  );
});
