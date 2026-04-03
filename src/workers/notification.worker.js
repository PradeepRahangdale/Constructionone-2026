import { Worker } from "bullmq";
import { connection } from "../config/bullmq.config.js";
import notificationQueue from '../config/notification.queue.js';


// Create a worker for processing notifications
const notificationWorker = new Worker('notification-worker', async job => {
  // Process the job
  // Logic for sending notifications
}, {
  connection,
});

// Start the worker
notificationWorker.start();

// Add a job to the notification queue
const notificationJob = notificationQueue.add('send-notification', {
    
  // Job data
  // Example: { recipient: 'user@example.com', message: 'Hello, this is a notification!' }
});

// You can also listen for job completion events
notificationQueue.on('completed', (job) => {
  console.log(`Notification job ${job.id} completed`);
});

export default notificationWorker;
