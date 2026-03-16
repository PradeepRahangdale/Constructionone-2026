import { Worker } from "bullmq";
import { connection } from "../config/bullmq.config.js";
import Wallet from "../models/vendorShop/vendorWallet.model.js";
import Transaction from "../models/vendorShop/vendorTransaction.model.js";

const settlementWorker = new Worker(
  "wallet-settlement-queue",

  async (job) => {
    const { vendorId, amount, transactionId } = job.data;

    const transaction = await Transaction.findById(transactionId);

    // Safety check
    if (!transaction || transaction.status !== "HOLD") {
      console.log("Settlement skipped:", transactionId);
      return;
    }

    const wallet = await Wallet.findOne({ vendorId });
    if (!wallet) return;

    wallet.availableBalance += amount;
    wallet.onHoldBalance -= amount;

    await wallet.save();
    transaction.status = "AVAILABLE";
    await transaction.save();

    console.log("Settlement done:", vendorId);
  },

  { connection },
);

settlementWorker.on("completed", (job) => {
  logger.info(`settlementWorker job ${job.id} completed`);
});

settlementWorker.on("failed", (job, err) => {
  logger.error(`settlementWorker job ${job.id} failed: ${err.message}`);
});
export default settlementWorker;
