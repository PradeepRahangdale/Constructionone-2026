import vendorTransactionModel from "../../models/vendorShop/vendorTransaction.model.js";
import Wallet from "../../models/vendorShop/vendorWallet.model.js";
import { settlementQueue } from "../../config/settlement.queue.js";
import APIError from "../../middlewares/errorHandler.js";
import mongoose from "mongoose";

//old withour session
// export const addSettlement = async (vendorId, orderId, amount) => {
//   const wallet = await Wallet.findOne({ vendorId });
//   if (!wallet) return;

//   // wallet hold balance update
//   wallet.onHoldBalance += amount;
//   wallet.totalBalance += amount;
//   await wallet.save();

//   // transaction create
//   const transaction = await vendorTransactionModel.create({
//     vendorId,
//     type: "ORDER_SETTLEMENT",
//     amount,
//     orderId,
//     status: "HOLD",
//     description: `Order ${orderId} settlement`,
//   });

//   // BullMQ settlement job
//   const job = await settlementQueue.add(
//     "walletSettlement",
//     {
//       vendorId,
//       amount,
//       transactionId: transaction._id,
//     },
//     {
//       delay: 7 * 24 * 60 * 60 * 1000, // 7 days
//     },
//   );

//   // save jobId
//   transaction.settlementJobId = job.id;
//   await transaction.save();
// };

// settlement trigger
//   if (status === "DELIVERED") {
//     await addSettlement(
//       order.vendorId,
//       order._id,
//       order.amount
//     );

//   }

// ----------->
// DELIVERED
// ↓
// RETURN_REQUESTED
// ↓
// RETURNED

// const job = await settlementQueue.getJob(transaction.settlementJobId);
// if (job) {
//   await job.remove();
// }

// ya ye flow
// const tx = await vendorTransactionModel.findOne({ orderId });
// if (tx?.settlementJobId) {
//   const job = await settlementQueue.getJob(tx.settlementJobId);
//   if (job) {
//     await job.remove();
//   }
// }

//order status delevered approved then call this function.
export const addSettlement = async (vendorId, orderId, amount) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    // Find wallet within transaction
    const wallet = await Wallet.findOne({ vendorId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      throw new Error("Wallet not found");
    }

    // Update wallet balances
    wallet.onHoldBalance += amount;
    wallet.totalBalance += amount;
    await wallet.save({ session });

    // Create transaction record
    const [transaction] = await vendorTransactionModel.create(
      [
        {
          vendorId,
          type: "ORDER_SETTLEMENT",
          amount,
          orderId,
          status: "HOLD",
          description: `Order ${orderId} settlement`,
        },
      ],
      { session },
    );
    await session.commitTransaction();
    session.endSession();
    // BullMQ settlement job (outside transaction - can't roll this back)
    const job = await settlementQueue.add(
      "walletSettlement",
      {
        vendorId,
        amount,
        transactionId: transaction._id,
      },
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    );

    // Update transaction with jobId
    transaction.settlementJobId = job.id;
    // await transaction.save({ session });
    await transaction.save();
    // Commit all database changes
    // await session.commitTransaction();

    return transaction;
  } catch (error) {
    // Rollback all database changes
    await session.abortTransaction();
    console.error("Settlement failed:", error);
    throw error;
  } finally {
    session.endSession();
  }
};
//order cancel or  return approve then call this function.
// export const cancelSettlement = async (vendorId, orderId) => {
//   const session = await mongoose.startSession();

//   try {
//     session.startTransaction();
//     const transaction = await vendorTransactionModel
//       .findOne({
//         vendorId,
//         orderId,
//         type: "ORDER_SETTLEMENT",
//       })
//       .session(session);

//     if (!transaction) {
//       throw new APIError(404, "Settlement transaction not found");
//     }

//     if (transaction.status !== "HOLD") {
//       throw new APIError(404, "Settlement already processed");
//     }

//     const wallet = await Wallet.findOne({ vendorId }).session(session);
//     wallet.onHoldBalance -= transaction.amount;
//     wallet.totalBalance -= transaction.amount;

//     await wallet.save({ session });
//     transaction.status = "CANCELLED";
//     await transaction.save({ session });

//     await session.commitTransaction();

//     // remove bullmq job
//     if (transaction.settlementJobId) {
//       const job = await settlementQueue.getJob(transaction.settlementJobId);
//       if (job) await job.remove();
//     }
//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

export const cancelSettlement = async (vendorId, orderId, session) => {
  try {
    const transaction = await vendorTransactionModel
      .findOne({
        vendorId,
        orderId,
        type: "ORDER_SETTLEMENT",
      })
      .session(session);

    if (!transaction) return;

    const wallet = await Wallet.findOne({ vendorId }).session(session);
    if (!wallet) throw new APIError("Wallet not found");

    // CASE 1  Settlement HOLD
    if (transaction.status === "HOLD") {
      wallet.onHoldBalance = Math.max(
        0,
        wallet.onHoldBalance - transaction.amount,
      );

      wallet.totalBalance = Math.max(
        0,
        wallet.totalBalance - transaction.amount,
      );

      await wallet.save({ session });

      transaction.status = "CANCELLED";
      await transaction.save({ session });

      // remove BullMQ job
      if (transaction.settlementJobId) {
        const job = await settlementQueue.getJob(transaction.settlementJobId);

        if (job && (await job.getState()) !== "completed") {
          await job.remove();
        }
      }

      return;
    }

    // CASE 2 Settlement already SUCCESS
    if (transaction.status === "SUCCESS") {
      wallet.availableBalance = Math.max(
        0,
        wallet.availableBalance - transaction.amount,
      );

      wallet.totalBalance = Math.max(
        0,
        wallet.totalBalance - transaction.amount,
      );

      await wallet.save({ session });

      // create refund transaction for vendor
      await vendorTransactionModel.create(
        [
          {
            vendorId,
            orderId,
            type: "REFUND",
            amount: transaction.amount,
            status: "SUCCESS",
            description: `Settlement reversed due to return for order ${orderId}`,
          },
        ],
        { session },
      );

      return;
    }
  } catch (error) {
    console.error("Cancel settlement failed:", error.message);
    throw error;
  }
};
//get wallet balance
// export const getWallet = async (req, res) => {
//   const vendorId = req.user.id;
//   const wallet = await Wallet.findOne({ vendorId });

//   if (!wallet) {
//     return res.status(404).json({
//       message: "Wallet not found",
//     });
//   }
//   const transactions = await vendorTransactionModel
//     .find({ vendorId })
//     .sort({ createdAt: -1 })
//     .limit(10);

//   res.json({
//     totalBalance: wallet.totalBalance,
//     available: wallet.availableBalance,
//     onHold: wallet.onHoldBalance,
//     transactions,
//   });
// };

export const getWallet = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const wallet = await Wallet.findOneAndUpdate(
      { vendorId },
      {
        $setOnInsert: {
          vendorId,
          totalBalance: 0,
          availableBalance: 0,
          onHoldBalance: 0,
        },
      },
      {
        new: true,
        upsert: true,
      },
    ).lean();

    return res.status(200).json({
      success: true,
      data: {
        totalBalance: wallet.totalBalance,
        availableBalance: wallet.availableBalance,
        onHoldBalance: wallet.onHoldBalance,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet",
      error: err.message,
    });
  }
};
//transaction history
export const getAllTransactionHistory = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const transactions = await vendorTransactionModel
      .find({ vendorId })
      .populate("bankAccountId", "accountNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await vendorTransactionModel.countDocuments({ vendorId });

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//single transation details
export const getTransactionDetails = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { transactionId } = req.params;

    const transaction = await vendorTransactionModel
      .findOne({ _id: transactionId, vendorId })
      .populate({
        path: "orderId",
        populate: {
          path: "userId",
          select: "firstName lastName phoneNumber email profileImage",
        },
      });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const order = transaction.orderId;
    const customer = order?.userId;

    const totalAmount = order?.totalAmount || 0;
    const vendorAmount = order?.netAmount || 0;
    const commission = totalAmount - vendorAmount;

    res.status(200).json({
      success: true,
      data: {
        transactionId: transaction._id,

        customerInfo: {
          name: `${customer?.firstName || ""} ${customer?.lastName || ""}`,
          phone: customer?.phoneNumber,
          email: customer?.email,
          profileImage: customer?.profileImage,
        },

        amountBreakdown: {
          totalAmount,
          commission,
          vendorReceivedAmount: vendorAmount,
        },

        invoiceUrl: order?.invoice,
        receiptUrl: order?.labelUrl,
        date: transaction.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//vendor earning analysis
export const getVendorEarningAnalytics = async (req, res) => {
  try {
    const vendorId = new mongoose.Types.ObjectId(req.user.id);
    const { type = "day", date } = req.query;

    const selectedDate = date ? new Date(date) : new Date();
    selectedDate.setHours(0, 0, 0, 0);

    let startDate;
    let endDate;
    let prevStartDate;
    let prevEndDate;

    if (type === "day") {
      startDate = new Date(selectedDate);
      endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 1);

      prevStartDate = new Date(selectedDate);
      prevStartDate.setDate(prevStartDate.getDate() - 1);

      prevEndDate = new Date(selectedDate);
    }

    if (type === "week") {
      startDate = new Date(selectedDate);
      startDate.setDate(startDate.getDate() - 6);

      endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 1);

      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);

      prevEndDate = new Date(startDate);
    }

    if (type === "month") {
      startDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1,
      );
      endDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() + 1,
        1,
      );

      prevStartDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() - 1,
        1,
      );
      prevEndDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1,
      );
    }

    const result = await vendorTransactionModel.aggregate([
      {
        $match: {
          vendorId,
          status: "SETTLED",
          createdAt: { $gte: prevStartDate, $lt: endDate },
        },
      },

      {
        $facet: {
          currentRevenue: [
            {
              $match: { createdAt: { $gte: startDate, $lt: endDate } },
            },
            {
              $group: { _id: null, total: { $sum: "$amount" } },
            },
          ],

          previousRevenue: [
            {
              $match: { createdAt: { $gte: prevStartDate, $lt: prevEndDate } },
            },
            {
              $group: { _id: null, total: { $sum: "$amount" } },
            },
          ],

          chart: [
            {
              $match: { createdAt: { $gte: startDate, $lt: endDate } },
            },
            {
              $group: {
                _id:
                  type === "day"
                    ? { $hour: "$createdAt" }
                    : type === "week"
                      ? { $dayOfWeek: "$createdAt" }
                      : { $dayOfMonth: "$createdAt" },

                revenue: { $sum: "$amount" },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const current = result[0].currentRevenue[0]?.total || 0;
    const previous = result[0].previousRevenue[0]?.total || 0;

    let growth = 0;

    if (previous > 0) {
      growth = ((current - previous) / previous) * 100;
    }

    res.json({
      success: true,

      data: {
        filter: type,
        selectedDate,
        revenue: current,
        previousRevenue: previous,
        growthPercentage: Number(growth.toFixed(2)),
        chart: result[0].chart,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
    });
  }
};

// // Example: When you need to update wallet AND create transaction atomically
// export const updateWalletBalance = async (req, res) => {
//   const session = await mongoose.startSession();
//   try {
//     session.startTransaction();
//     const { vendorId, amount } = req.body;

//     // Update wallet
//     const wallet = await Wallet.findOneAndUpdate(
//       { vendorId },
//       { $inc: { totalBalance: amount } },
//       { new: true, session },
//     );

//     if (!wallet) {
//       await session.abortTransaction();
//       return res.status(404).json({ message: "Wallet not found" });
//     }

//     // Create transaction record
//     const transaction = await vendorTransactionModel.create(
//       [
//         {
//           vendorId,
//           amount,
//           type: "credit",
//           description: "Wallet top-up",
//         },
//       ],
//       { session },
//     );

//     await session.commitTransaction();

//     res.json({
//       success: true,
//       wallet,
//       transaction: transaction[0],
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   } finally {
//     session.endSession();
//   }
// };
