const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  queueNumber: { type: Number, required: true },
  customerCount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['waiting', 'called', 'seated', 'cancelled'], 
    default: 'waiting' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Queue', queueSchema);