const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, unique: true },
  capacity: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['available', 'occupied', 'reserved'], 
    default: 'available' 
  },
  currentQueueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Queue' }
});

module.exports = mongoose.model('Table', tableSchema);