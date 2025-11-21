const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  queueNumber: { type: Number, required: true },
  customerCount: { type: Number, required: true },
  // เพิ่มฟิลด์ราคา
  totalPrice: { type: Number, default: 0 }, 
  status: { 
    type: String, 
    enum: ['waiting', 'called', 'seated', 'cancelled'], 
    default: 'waiting' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Queue', queueSchema);