const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  queueNumber: { type: Number, required: true },
  customerCount: { type: Number, required: true },
  totalPrice: { type: Number, default: 0 }, // เพิ่มฟิลด์นี้
  status: { 
    type: String, 
    enum: ['waiting', 'called', 'seated', 'cancelled'], 
    default: 'waiting' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Queue', queueSchema);