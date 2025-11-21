const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Attendance = require('./models/Attendance');
const Queue = require('./models/Queue');
const User = require('./models/User');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "buffet_secret_key_123"; 
const PRICE_PER_HEAD = 399; // 🏷️ ราคาบุฟเฟต์ต่อหัว

// --- DATABASE CONNECT ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// --- MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: "No token, authorization denied" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) { res.status(400).json({ message: "Token is not valid" }); }
};

// --- HELPER: Date Range ---
const getTodayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getDateRange = (dateString) => {
  const start = new Date(dateString); start.setHours(0, 0, 0, 0);
  const end = new Date(dateString); end.setHours(23, 59, 59, 999);
  return { start, end };
};

// --- AUTHENTICATION ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, role: user.role, username: user.username });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- USER MANAGEMENT (Admin Only) ---
app.get('/api/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  const users = await User.find({}, '-password').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const { username, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, role });
    await newUser.save();
    res.json(newUser);
  } catch (err) { res.status(500).json({ message: "Error creating user" }); }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

// --- QUEUE MANAGEMENT ---
app.get('/api/queue', async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const currentQueue = await Queue.findOne({ status: { $ne: 'waiting' }, createdAt: { $gte: start, $lt: end } }).sort({ updatedAt: -1 });
    const waitingQueues = await Queue.find({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
    const totalToday = await Queue.countDocuments({ createdAt: { $gte: start, $lt: end } });
    res.json({ currentQueue, waitingQueues, totalToday });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/queue/add', authMiddleware, async (req, res) => {
  try {
    const { customerCount } = req.body;
    const { start, end } = getTodayRange();
    const lastQueue = await Queue.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: -1 });
    const nextNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;
    const totalPrice = customerCount * PRICE_PER_HEAD;
    const newQueue = new Queue({ queueNumber: nextNumber, customerCount, totalPrice });
    await newQueue.save();
    res.json(newQueue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/queue/next', authMiddleware, async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const nextQueue = await Queue.findOne({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
    if (!nextQueue) return res.status(400).json({ message: "No waiting queue" });
    nextQueue.status = 'called';
    await nextQueue.save();
    res.json(nextQueue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/queue/update/:id', authMiddleware, async (req, res) => {
  try {
    const queue = await Queue.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(queue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- LOGS (Admin Only) - Filter by Date ---
app.get('/api/logs', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    // รับค่า date จาก query param (เช่น ?date=2023-10-25)
    const { date } = req.query;
    let start, end;

    if (date) {
      // ถ้ามีวันที่ส่งมา ให้ใช้ช่วงเวลานั้น
      ({ start, end } = getDateRange(date));
    } else {
      // ถ้าไม่มี ให้ใช้วันนี้
      ({ start, end } = getTodayRange());
    }

    // ดึง Logs ตามช่วงเวลา
    const logs = await Queue.find({ 
      createdAt: { $gte: start, $lt: end } 
    }).sort({ createdAt: -1 }); // เรียงใหม่ไปเก่า

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DASHBOARD REPORTS (Full Summary) ---
app.get('/api/reports', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  
  const now = new Date();
  const startToday = new Date(now.setHours(0,0,0,0));
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYear = new Date(now.getFullYear(), 0, 1);

  const getSummary = async (fromDate) => {
    const data = await Queue.aggregate([
      { $match: { createdAt: { $gte: fromDate } } },
      { 
        $group: { 
          _id: null, 
          totalQueues: { $sum: 1 },
          totalRevenue: { $sum: { $cond: [{ $eq: ["$status", "seated"] }, "$totalPrice", 0] } },
          totalCustomers: { $sum: { $cond: [{ $eq: ["$status", "seated"] }, "$customerCount", 0] } },
          cancelledQueues: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } }
        } 
      }
    ]);
    return data[0] || { totalQueues: 0, totalRevenue: 0, totalCustomers: 0, cancelledQueues: 0 };
  };

  const [daily, monthly, yearly] = await Promise.all([
    getSummary(startToday),
    getSummary(startMonth),
    getSummary(startYear)
  ]);

  res.json({ daily, monthly, yearly });
});

// Helper: Get Date String (YYYY-MM-DD)
const getTodayDateStr = () => {
  const d = new Date();
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
};

// 1. Worker: Check Status Today
app.get('/api/attendance/me', authMiddleware, async (req, res) => {
  try {
    const today = getTodayDateStr();
    const record = await Attendance.findOne({ userId: req.user.id, date: today });
    res.json(record || { status: 'idle' }); // idle = ยังไม่เข้างาน
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Worker: Check In
app.post('/api/attendance/checkin', authMiddleware, async (req, res) => {
  try {
    const today = getTodayDateStr();
    // เช็คว่าวันนี้เข้าหรือยัง
    const existing = await Attendance.findOne({ userId: req.user.id, date: today });
    if (existing) return res.status(400).json({ message: "Already checked in today" });

    const newRecord = new Attendance({ userId: req.user.id, date: today });
    await newRecord.save();
    res.json(newRecord);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Worker: Check Out
app.put('/api/attendance/checkout', authMiddleware, async (req, res) => {
  try {
    const today = getTodayDateStr();
    const record = await Attendance.findOne({ userId: req.user.id, date: today });
    if (!record) return res.status(400).json({ message: "No check-in record found" });
    
    record.checkOut = Date.now();
    record.status = 'completed';
    await record.save();
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. Admin: Get All Staff Status Today
app.get('/api/attendance/today', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const today = getTodayDateStr();
    // ดึง User ทั้งหมดมา
    const users = await User.find({ role: 'worker' }, '-password'); // เอาเฉพาะ Worker
    
    // ดึง Attendance ของวันนี้
    const attendances = await Attendance.find({ date: today });

    // จับคู่ User กับ Attendance
    const result = users.map(user => {
      const att = attendances.find(a => a.userId.toString() === user._id.toString());
      return {
        _id: user._id,
        username: user.username,
        attendance: att || null // ถ้าไม่มีแปลว่ายังไม่มา
      };
    });

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/attendance/reset/:userId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const today = getTodayDateStr();
    const record = await Attendance.findOne({ userId: req.params.userId, date: today });
    
    if (!record) return res.status(404).json({ message: "No record found today" });

    // ล้างเวลาออก และเปลี่ยนสถานะกลับเป็น working
    record.checkOut = undefined; 
    record.status = 'working';
    await record.save();
    
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. Admin: Edit Time (แก้ไขเวลาเข้า-ออก)
app.put('/api/attendance/edit/:userId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const { checkInTime, checkOutTime } = req.body; // รับค่าเป็น string "HH:mm"
    const today = getTodayDateStr();
    
    // หา Record ของวันนี้ (ถ้าไม่มีให้สร้างใหม่ เผื่อแก้ให้คนที่ยังไม่เคยลง)
    let record = await Attendance.findOne({ userId: req.params.userId, date: today });
    if (!record) {
        record = new Attendance({ userId: req.params.userId, date: today });
    }

    // Helper: รวมวันที่ปัจจุบัน เข้ากับเวลาที่ส่งมา
    const mergeTime = (baseDate, timeStr) => {
        if (!timeStr) return undefined;
        const [hours, minutes] = timeStr.split(':').map(Number);
        const newDate = new Date(baseDate);
        newDate.setHours(hours, minutes, 0, 0);
        return newDate;
    };

    // ใช้วันที่จาก checkIn เดิม หรือถ้าไม่มีให้ใช้วันนี้
    const baseDate = record.checkIn ? new Date(record.checkIn) : new Date();

    // Update Check In
    if (checkInTime) {
        record.checkIn = mergeTime(baseDate, checkInTime);
    }

    // Update Check Out
    if (checkOutTime) {
        record.checkOut = mergeTime(baseDate, checkOutTime);
        record.status = 'completed';
    } else if (checkOutTime === "") {
        // ถ้าส่งค่าว่างมา แปลว่าลบเวลาออก (Reset)
        record.checkOut = undefined;
        record.status = 'working';
    }

    await record.save();
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));