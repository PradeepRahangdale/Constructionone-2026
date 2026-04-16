import VendorBankAccount from "../../models/vendorShop/vendorBankAccount.model.js";
export const addBankAccount = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      accountType,
      upiId,
    } = req.body;

    let cancelledCheque = "";
    if (req.files?.cancelledCheque) {
      cancelledCheque = req.files.cancelledCheque[0].location;
    }

    // check if vendor already has bank
    const existingDefault = await VendorBankAccount.findOne({
      vendorId,
      isDefault: true,
    });

    const bank = await VendorBankAccount.create({
      vendorId,
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      accountType,
      upiId,
      cancelledCheque,
      isDefault: existingDefault ? false : true, // first bank default
    });

    return res.status(201).json({
      success: true,
      message: "Bank added successfully",
      data: bank,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
};
export const getVendorBankAccounts = async (req, res) => {
  try {
    const vendorId = req.user.id;
    // const vendorId = "69e0ba37e0de9730ed927351"
    console.log("Fetching bank accounts for vendorId:", vendorId);
    const accounts = await VendorBankAccount.find({
      vendorId,
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

export const updateBankAccount = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      accountType,
      upiId,
    } = req.body;

    // check bank exists & belongs to vendor
    const bank = await VendorBankAccount.findOne({
      _id: id,
      vendorId,
    });

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found",
      });
    }

    // handle file upload
    let cancelledCheque = bank.cancelledCheque;
    if (req.files?.cancelledCheque) {
      cancelledCheque = req.files.cancelledCheque[0].location;
    }

    // update fields (only if provided)
    bank.accountHolderName = accountHolderName || bank.accountHolderName;
    bank.accountNumber = accountNumber || bank.accountNumber;
    bank.ifscCode = ifscCode || bank.ifscCode;
    bank.bankName = bankName || bank.bankName;
    bank.accountType = accountType || bank.accountType;
    bank.upiId = upiId || bank.upiId;
    bank.cancelledCheque = cancelledCheque;

    await bank.save();

    return res.status(200).json({
      success: true,
      message: "Bank account updated successfully",
      data: bank,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message,
    });
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
