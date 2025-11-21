const mongoose = require('mongoose');

const QueueSchema = new mongoose.Schema({
  queueNumber: {
    type: Number,
    required: true,
  },
  numberOfCustomers: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['waiting', 'serving', 'completed', 'cancelled'],
    default: 'waiting',
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('Queue', QueueSchema);
