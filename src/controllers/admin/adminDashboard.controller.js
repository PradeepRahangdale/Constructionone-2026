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
import adminTransaction from "../../models/admin/adminTransaction.model.js";
import Brand from "../../models/vendorShop/brand.model.js";

export const getAdminDashboardData = catchAsync(async (req, res, next) => {
  let { filter, year, startDate, endDate } = req.query;

  let fromDate;
  let toDate;
  const cacheKey = `admin_dashboard_${filter || "year"}_${year || new Date().getFullYear()}`;
  const cachedData = await RedisCache.get(cacheKey);

  if (cachedData) {
    return res
      .status(200)
      .json(
        new ApiResponse(200, cachedData, "Admin Dashboard fetched from cache"),
      );
  }

  // ---------------- DATE FILTER ----------------

  const currentYear = new Date().getFullYear();
  year = year ? parseInt(year) : currentYear;

  switch (filter) {
    case "today":
      fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);

      toDate = new Date();
      toDate.setHours(23, 59, 59, 999);
      break;

    case "yesterday":
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 1);
      fromDate.setHours(0, 0, 0, 0);

      toDate = new Date();
      toDate.setDate(toDate.getDate() - 1);
      toDate.setHours(23, 59, 59, 999);
      break;

    case "last7days":
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);

      toDate = new Date();
      break;

    case "last30days":
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);

      toDate = new Date();
      break;

    case "thisMonth":
      fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      toDate = new Date();
      break;

    case "lastMonth":
      fromDate = new Date(
        new Date().getFullYear(),
        new Date().getMonth() - 1,
        1,
      );

      toDate = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
      toDate.setHours(23, 59, 59, 999);
      break;

    case "lifetime":
      fromDate = new Date("2020-01-01");
      toDate = new Date();
      break;

    default:
      if (startDate && endDate) {
        fromDate = new Date(startDate);
        toDate = new Date(endDate);
        toDate.setHours(23, 59, 59, 999);
      } else {
        // year filter
        fromDate = new Date(year, 0, 1);
        toDate = new Date(year + 1, 0, 1);
      }
  }

  const [
    totalRevenueAgg,
    totalTransactionRevenueAgg,
    totalOrders,

    totalVendors,
    verifiedVendors,
    unverifiedVendors,

    totalUsers,

    activeVendor,
    ordersDelivered,
    pendingOrders,
    placedOrders,

    totalSubAdmin,
    totalTransactions,

    totalBrands,
    totalCities,
    totalStates,
    totalPCategories,
    totalCategories,
    totalSubCategories,
  ] = await Promise.all([
    // Total Revenue
    Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          "items.status": "DELIVERED",
          createdAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $multiply: ["$items.price", "$items.quantity"],
            },
          },
        },
      },
    ]),

    // Total Transaction Revenue
    adminTransaction.aggregate([
      {
        $match: {
          createdAt: {
            $gte: fromDate,
            $lte: toDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalTransactionRevenue: {
            $sum: "$amount",
          },
        },
      },
    ]),

    // Total Orders
    Order.countDocuments({
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    }),

    // Total Vendors
    VendorProfile.countDocuments(),

    // Verified Vendors
    VendorProfile.countDocuments({
      isAdminVerified: true,
    }),

    // Unverified Vendors
    VendorProfile.countDocuments({
      isAdminVerified: false,
    }),

    // Total Users (only USER role)
    User.countDocuments({
      role: "USER",
    }),

    // Active Vendors
    VendorProfile.countDocuments({
      isAdminVerified: true,
    }),

    // Delivered Orders
    Order.countDocuments({
      "items.status": "DELIVERED",
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    }),

    // Pending Orders
    Order.countDocuments({
      "items.status": "PENDING",
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    }),

    // Placed Orders (CONFIRMED)
    Order.countDocuments({
      "items.status": "CONFIRMED",
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    }),

    // Total Sub Admin
    User.countDocuments({
      role: "SUB_ADMIN",
    }),

    // Total Transactions
    adminTransaction.countDocuments({
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    }),

    // Total Brands
    Brand.countDocuments(),

    // Total Cities
    City.countDocuments(),

    // Total States
    State.countDocuments(),

    // Total Parent Categories
    Pcategory.countDocuments(),

    // Total Categories
    Category.countDocuments(),

    // Total SubCategories
    SubCategory.countDocuments(),
  ]);

  // ---------------- MONTH WISE USERS ----------------
  // ---------------- MONTH WISE USERS / VENDORS / ORDERS (1 to 12 months) ----------------

  const selectedYear = year || new Date().getFullYear();

  const usersByMonthAgg = await User.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(selectedYear, 0, 1),
          $lt: new Date(selectedYear + 1, 0, 1),
        },
      },
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
        },
        totalUsers: {
          $sum: 1,
        },
      },
    },
  ]);

  const vendorsByMonthAgg = await VendorProfile.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(selectedYear, 0, 1),
          $lt: new Date(selectedYear + 1, 0, 1),
        },
      },
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
        },
        totalVendors: {
          $sum: 1,
        },
      },
    },
  ]);

  const ordersByMonthAgg = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(selectedYear, 0, 1),
          $lt: new Date(selectedYear + 1, 0, 1),
        },
      },
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
        },
        totalOrders: {
          $sum: 1,
        },
      },
    },
  ]);

  // -------- FORMAT 1 to 12 MONTHS --------

  const usersByMonth = {};
  const vendorsByMonth = {};
  const ordersByMonth = {};

  for (let i = 1; i <= 12; i++) {
    usersByMonth[i] = 0;
    vendorsByMonth[i] = 0;
    ordersByMonth[i] = 0;
  }

  usersByMonthAgg.forEach((item) => {
    usersByMonth[item._id.month] = item.totalUsers;
  });

  vendorsByMonthAgg.forEach((item) => {
    vendorsByMonth[item._id.month] = item.totalVendors;
  });

  ordersByMonthAgg.forEach((item) => {
    ordersByMonth[item._id.month] = item.totalOrders;
  });

  // ---------------- TOP VENDORS ----------------

  const topVendors = await VendorProfile.aggregate([
    {
      $match: {
        isAdminVerified: true,
      },
    },

    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "vendorId",
        as: "orders",
      },
    },

    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "vendorId",
        as: "reviews",
      },
    },

    {
      $addFields: {
        totalOrders: {
          $size: "$orders",
        },

        totalReviews: {
          $size: "$reviews",
        },

        totalRevenue: {
          $sum: "$orders.totalAmount",
        },
      },
    },

    {
      $project: {
        _id: 1,
        companyName: 1,
        totalOrders: 1,
        totalReviews: 1,
        totalRevenue: 1,
      },
    },

    {
      $sort: {
        totalRevenue: -1,
      },
    },

    {
      $limit: 5,
    },
  ]);

  // ---------------- RECENT ACTIVITY ----------------

  const recentActivities = await User.find({
    role: {
      $in: ["SUB_ADMIN", "VENDOR"],
    },
  })
    .sort({ updatedAt: -1 })
    .limit(10)
    .select("firstName lastName email role updatedAt");

  // ---------------- RESPONSE ----------------

  const responseData = {
    filter,
    year,

    dateRange: {
      startDate: fromDate,
      endDate: toDate,
    },

    summary: {
      totalRevenue: totalRevenueAgg[0]?.totalRevenue || 0,
      totalTransactionRevenue:
        totalTransactionRevenueAgg[0]?.totalTransactionRevenue || 0,

      totalOrders,
      totalVendors,
      verifiedVendors,
      unverifiedVendors,

      totalUsers,

      activeVendor,

      ordersDelivered,
      pendingOrders,
      placedOrders,

      totalSubAdmin,
      totalTransactions,

      totalBrands,
      totalCities,
      totalStates,

      totalPCategories,
      totalCategories,
      totalSubCategories,
    },
    monthWiseAnalytics: {
      usersByMonth,
      vendorsByMonth,
      ordersByMonth,
    },

    recentActivities,
    topVendors,
  };

  await RedisCache.set(
    cacheKey,
    responseData,
    300, // 5 min cache
  );
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        responseData,
        "Admin Dashboard fetched successfully",
      ),
    );
});

//  await RedisCache.deletePattern("admin_dashboard_*"); - clear all dashboard caches when relevant data changes (e.g. new order, new user, etc.)
