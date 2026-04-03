import VendorBankAccount from "../../models/vendorShop/vendotBankAccount.model.js";
export const addBankAccount = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { accountHolderName, accountNumber, ifscCode, bankName } = req.body;

    // count existing accounts
    const count = await VendorBankAccount.countDocuments({ vendorId });
    const account = await VendorBankAccount.create({
      vendorId,
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      isDefault: count === 0,
    });

    res.status(201).json({
      success: true,
      message: "Bank account added",
      data: account,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const getVendorBankAccounts = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const accounts = await VendorBankAccount.find({
      vendorId,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const deleteBankAccount = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { id } = req.params;

    const account = await VendorBankAccount.findById(id);

    const wasDefault = account.isDefault;

    // deactivate
    await VendorBankAccount.findByIdAndUpdate(id, {
      isActive: false,
      isDefault: false,
    });

    if (wasDefault) {
      const another = await VendorBankAccount.findOne({
        vendorId,
        isActive: true,
      });

      if (another) {
        another.isDefault = true;
        await another.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Bank removed",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const setDefaultBankAccount = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { bankAccountId } = req.body;

    const accounts = await VendorBankAccount.find({
      vendorId,
      isActive: true,
    });

    if (accounts.length === 1) {
      return res.status(200).json({
        success: true,
        message: "Only one account, already default",
      });
    }

    // reset all
    await VendorBankAccount.updateMany(
      { vendorId },
      { $set: { isDefault: false } },
    );

    // set selected
    const updated = await VendorBankAccount.findByIdAndUpdate(
      bankAccountId,
      { isDefault: true },
      { new: true },
    );

    res.status(200).json({
      success: true,
      message: "Default bank updated",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// import vendorWithdrawalBalanceModel from "../../models/vendorShop/vendorWithdrawalBalance.model.js";
// export const getWithdrawals = async (req, res) => {
//   try {
//     const vendorId = req.user._id;

//     const data = await vendorWithdrawalBalanceModel
//       .find({ vendorId })
//       .populate("bankAccountId")
//       .sort({ createdAt: -1 });

//     res.json({
//       success: true,
//       data,
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };
