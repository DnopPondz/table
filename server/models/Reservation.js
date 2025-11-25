const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  customerPhone: { type: String },
  reservationTime: { type: Date, required: true },
  pax: { type: Number, required: true },
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
  status: {
    type: String,
    enum: ['pending', 'checked-in', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reservation', reservationSchema);