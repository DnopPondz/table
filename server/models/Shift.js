const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // ใครปิดกะ
  date: { type: Date, default: Date.now },
  systemTotal: { type: Number, required: true }, // ยอดขายในระบบ
  cashInDrawer: { type: Number, required: true }, // เงินสดที่นับได้
  variance: { type: Number }, // ส่วนต่าง (ขาด/เกิน)
  note: String
});

// จุดที่น่าจะผิดคือบรรทัดนี้ ต้องเป็น 'Shift' ไม่ใช่ 'Table'
module.exports = mongoose.model('Shift', shiftSchema);