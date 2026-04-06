import { Queue } from "bullmq";
import connection from "./redis.config.js";

// Create a new queue for notifications
const notificationQueue = new Queue("notification-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: "exponential",
      delay: 5000, // 5 sec delay
    },
    removeOnComplete: true, // memory save
    removeOnFail: false,
  },
});

export default notificationQueue;
// console.log("notification Queue initialized");
