import vendorTransactionModel from "../../models/vendorShop/vendorTransaction.model.js";
import vendorWalletModel from "../../models/vendorShop/vendorWallet.model.js";
import vendorWithdrawalBalanceModel from "../../models/vendorShop/vendorWithdrawalBalance.model.js";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";

export const requestWithdraw = async (req, res) => {
  const vendorId = req.user.id;
  const { amount, bankAccountId } = req.body;

  const wallet = await vendorWalletModel.findOne({ vendorId });

  if (wallet.availableBalance < amount) {
    return res.status(400).json({
      message: "Insufficient balance",
    });
  }

  const request = await vendorWithdrawalBalanceModel.create({
    vendorId,
    amount,
    bankAccountId: bankAccountId || "",
  });

  res.json({
    success: true,
    message: "Withdrawal request sent",
    data: request,
  });
};

// export const approveWithdraw = async (req, res) => {
//   const { withdrawalId } = req.params;

//   const withdrawal = await vendorWithdrawalBalanceModel.findById(withdrawalId);
//   const wallet = await vendorWalletModel.findOne({
//     vendorId: withdrawal.vendorId,
//   });

//   wallet.availableBalance -= withdrawal.amount;
//   wallet.totalBalance -= withdrawal.amount;

//   await wallet.save();

//   withdrawal.status = "APPROVED";
//   await withdrawal.save();

//   await vendorTransactionModel.create({
//     vendorId: withdrawal.vendorId,
//     type: "WITHDRAWAL",
//     amount: withdrawal.amount,
//     status: "COMPLETED",
//     description: "Withdrawal to bank",
//   });

//   res.json({
//     success: true,
//     message: "Withdrawal approved",
//   });
// };

// export const rejectWithdraw = async (req, res) => {
//   const { withdrawalId } = req.params;

//   const withdrawal = await vendorWithdrawalBalanceModel.findById(withdrawalId);

//   if (!withdrawal) {
//     return res.status(404).json({ message: "Request not found" });
//   }

//   const wallet = await vendorWalletModel.findOne({
//     vendorId: withdrawal.vendorId,
//   });

//   wallet.pendingWithdrawal -= withdrawal.amount;

//   await wallet.save();

//   withdrawal.status = "REJECTED";
//   withdrawal.adminNote = "Bank details invalid";

//   await withdrawal.save();

//   res.json({
//     success: true,
//     message: "Withdrawal rejected",
//   });
// };

export const getAllWithdrawalRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = {};
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const withdrawals = await vendorWithdrawalBalanceModel
      .find(query)
      .populate("vendorId", "firstName lastName phoneNumber email ")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await vendorWithdrawalBalanceModel.countDocuments(query);

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: withdrawals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const approveWithdraw = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { withdrawalId } = req.params;

    const withdrawal = await vendorWithdrawalBalanceModel
      .findById(withdrawalId)
      .session(session);

    const wallet = await vendorWalletModel
      .findOne({ vendorId: withdrawal.vendorId })
      .session(session);

    wallet.availableBalance -= withdrawal.amount;
    wallet.totalBalance -= withdrawal.amount;
    await wallet.save({ session });

    withdrawal.status = "APPROVED";
    await withdrawal.save({ session });

    await vendorTransactionModel.create(
      [
        {
          vendorId: withdrawal.vendorId,
          type: "WITHDRAWAL",
          amount: withdrawal.amount,
          status: "COMPLETED",
          description: "Withdrawal to bank",
        },
      ],
      { session },
    );

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Withdrawal approved",
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const rejectWithdraw = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { withdrawalId } = req.params;

    const withdrawal = await vendorWithdrawalBalanceModel
      .findById(withdrawalId)
      .session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Request not found" });
    }

    const wallet = await vendorWalletModel
      .findOne({ vendorId: withdrawal.vendorId })
      .session(session);

    wallet.pendingWithdrawal -= withdrawal.amount; // Note: Your code subtracts from pendingWithdrawal
    await wallet.save({ session });

    withdrawal.status = "REJECTED";
    withdrawal.adminNote = "Bank details invalid";
    await withdrawal.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Withdrawal rejected",
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const downloadStatementPDF = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { from, to, status } = req.query;

    let filter = { vendorId };

    if (from && to) {
      filter.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to),
      };
    }

    if (status) {
      filter.status = status;
    }

    const withdrawals = await vendorWithdrawalBalanceModel
      .find(filter)
      .populate("bankAccountId")
      .sort({ createdAt: -1 });

    const doc = new PDFDocument({ margin: 30 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=statement.pdf");

    doc.pipe(res);

    doc.fontSize(18).text("Vendor Withdrawal Statement", {
      align: "center",
    });

    doc.moveDown();

    doc.fontSize(10).text(`From: ${from || "All"}  To: ${to || "All"}`);

    doc.moveDown();

    doc
      .fontSize(12)
      .text("Date       | Amount | Status     | Bank       | Account");

    doc.moveDown();

    withdrawals.forEach((item) => {
      const row = `
${item.createdAt.toISOString().split("T")[0]} | 
${item.amount} | 
${item.status} | 
${item.bankAccountId?.bankName || "-"} | 
${item.bankAccountId?.accountNumber || "-"}`;

      doc.fontSize(10).text(row);
      doc.moveDown();
    });

    const total = withdrawals.reduce((sum, i) => sum + i.amount, 0);
    doc.moveDown();
    doc.fontSize(12).text(`Total Withdrawn: ₹${total}`);
    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// const downloadPDF = async () => {
//   const res = await axios.get(
//     "/api/vendor/bank/statement/pdf?from=2026-01-01&to=2026-03-01",
//     { responseType: "blob" }
//   );
