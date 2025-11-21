const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // เก็บวันที่ YYYY-MM-DD เพื่อเช็คว่าวันนี้ลงหรือยัง
  checkIn: { type: Date, default: Date.now },
  checkOut: { type: Date },
  status: { type: String, enum: ['working', 'completed'], default: 'working' }
});

module.exports = mongoose.model('Attendance', attendanceSchema);