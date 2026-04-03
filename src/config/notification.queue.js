import { Queue } from 'bullmq';
import connection from './redis.config.js';

// Create a new queue for notifications
const notificationQueue = new Queue('notification-queue', {
  connection,
});

export default notificationQueue;