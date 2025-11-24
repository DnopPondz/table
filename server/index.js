const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const Attendance = require('./models/Attendance');
const Queue = require('./models/Queue');
const User = require('./models/User');
const Table = require('./models/Table');
const Shift = require('./models/Shift');
const Setting = require('./models/Setting');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// --- SERVER & SOCKET SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "buffet_secret_key_123"; 

// --- DATABASE ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
    initSettings();
  })
  .catch(err => console.log(err));

// --- SETTINGS INITIALIZATION ---
const initSettings = async () => {
  try {
    const defaultSettings = [
      { key: 'pricePerHead', value: 399, label: 'Price Per Head', type: 'number' },
      { key: 'restaurantName', value: 'Buffet POS', label: 'Restaurant Name', type: 'string' },
      { key: 'vatRate', value: 7, label: 'VAT Rate (%)', type: 'number' }
    ];

    for (const setting of defaultSettings) {
      const exists = await Setting.findOne({ key: setting.key });
      if (!exists) {
        await Setting.create(setting);
        console.log(`Initialized setting: ${setting.key}`);
      }
    }
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
};

// --- HELPERS ---
const getTodayDateStr = () => {
  const date = new Date();
  const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = date.toLocaleDateString('en-GB', options).split('/');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date.toISOString().split('T')[0];
};

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

const broadcastUpdate = async () => {
  const { start, end } = getTodayRange();
  const currentQueue = await Queue.findOne({ status: { $ne: 'waiting' }, createdAt: { $gte: start, $lt: end } }).sort({ updatedAt: -1 });
  const waitingQueues = await Queue.find({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
  const totalToday = await Queue.countDocuments({ createdAt: { $gte: start, $lt: end } });
  
  // *** UPDATED: Populate Queue Info ***
  const tables = await Table.find().sort({ tableNumber: 1 }).populate('currentQueueId');

  io.emit('update-data', { currentQueue, waitingQueues, totalToday, tables });
};

// --- MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) { res.status(400).json({ message: "Invalid Token" }); }
};

// ================= ROUTES =================

// --- SETTINGS ---
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Setting.find({});
    // Convert array to object for easier frontend consumption, or just return list
    // Let's return the list so we can edit by key
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const updates = req.body; // Expecting array of { key, value } or object
    // If it's an array
    if (Array.isArray(updates)) {
      for (const update of updates) {
         await Setting.findOneAndUpdate({ key: update.key }, { value: update.value });
      }
    } else {
       // Single update
       const { key, value } = updates;
       await Setting.findOneAndUpdate({ key }, { value });
    }
    res.json({ message: "Settings updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- QUEUE ---
app.get('/api/queue', async (req, res) => {
  await broadcastUpdate();
  const { start, end } = getTodayRange();
  const currentQueue = await Queue.findOne({ status: { $ne: 'waiting' }, createdAt: { $gte: start, $lt: end } }).sort({ updatedAt: -1 });
  const waitingQueues = await Queue.find({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
  const totalToday = await Queue.countDocuments({ createdAt: { $gte: start, $lt: end } });
  res.json({ currentQueue, waitingQueues, totalToday });
});

app.post('/api/queue/add', authMiddleware, async (req, res) => {
  const { customerCount } = req.body;
  const { start, end } = getTodayRange();

  // Fetch Price dynamically
  const priceSetting = await Setting.findOne({ key: 'pricePerHead' });
  const pricePerHead = priceSetting ? parseFloat(priceSetting.value) : 399;

  const lastQueue = await Queue.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: -1 });
  const nextNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;
  const newQueue = new Queue({ queueNumber: nextNumber, customerCount, totalPrice: customerCount * pricePerHead });
  await newQueue.save();
  broadcastUpdate();
  res.json(newQueue);
});

app.put('/api/queue/next', authMiddleware, async (req, res) => {
  const { start, end } = getTodayRange();
  const nextQueue = await Queue.findOne({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
  if (!nextQueue) return res.status(400).json({ message: "No waiting queue" });
  nextQueue.status = 'called';
  await nextQueue.save();
  broadcastUpdate();
  res.json(nextQueue);
});

app.put('/api/queue/update/:id', authMiddleware, async (req, res) => {
  await Queue.findByIdAndUpdate(req.params.id, { status: req.body.status });
  broadcastUpdate();
  res.json({ message: "Updated" });
});

app.delete('/api/queue/reset', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  await Queue.deleteMany({ status: 'waiting' }); 
  broadcastUpdate();
  res.json({ message: "Cleared" });
});

// --- TABLES ---
app.get('/api/tables', async (req, res) => {
  // *** UPDATED: Populate Queue Info ***
  const tables = await Table.find().sort({ tableNumber: 1 }).populate('currentQueueId');
  res.json(tables);
});

app.post('/api/tables', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const newTable = new Table(req.body);
    await newTable.save();
    broadcastUpdate();
    res.json(newTable);
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.put('/api/tables/:id/assign', authMiddleware, async (req, res) => {
  const { queueId } = req.body;
  try {
    const table = await Table.findById(req.params.id);
    if (queueId) {
      table.status = 'occupied';
      table.currentQueueId = queueId;
      await Queue.findByIdAndUpdate(queueId, { status: 'seated' });
    } else {
      table.status = 'available';
      table.currentQueueId = null;
    }
    await table.save();
    broadcastUpdate();
    res.json(table);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tables/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    await Table.findByIdAndDelete(req.params.id);
    broadcastUpdate();
    res.json({ message: "Deleted" });
});

// --- SHIFT ---
app.post('/api/shift/close', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  try {
    const { cashInDrawer, note } = req.body;
    const { start, end } = getTodayRange();
    const queues = await Queue.find({ status: 'seated', createdAt: { $gte: start, $lt: end } });
    const systemTotal = queues.reduce((sum, q) => sum + q.totalPrice, 0);
    const variance = cashInDrawer - systemTotal;
    const newShift = new Shift({ closedBy: req.user.id, systemTotal, cashInDrawer, variance, note });
    await newShift.save();
    res.json(newShift);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/shift/history', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    const shifts = await Shift.find().populate('closedBy', 'username').sort({ date: -1 }).limit(10);
    res.json(shifts);
});

// --- AUTH & USERS & ATTENDANCE & LOGS ---
app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username });
      if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Invalid" });
      const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token, role: user.role, username: user.username });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    } catch (err) { res.status(500).json({ message: "Error" }); }
});
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

app.get('/api/reports', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    const now = new Date();
    const startToday = new Date(now.setHours(0,0,0,0));
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);
    const getSummary = async (fromDate) => {
      const data = await Queue.aggregate([
        { $match: { createdAt: { $gte: fromDate } } },
        { $group: { _id: null, totalRevenue: { $sum: { $cond: [{ $eq: ["$status", "seated"] }, "$totalPrice", 0] } } } }
      ]);
      return data[0] || { totalRevenue: 0 };
    };
    const [daily, monthly, yearly] = await Promise.all([getSummary(startToday), getSummary(startMonth), getSummary(startYear)]);
    res.json({ daily, monthly, yearly });
});

app.get('/api/attendance/me', authMiddleware, async (req, res) => {
    const today = getTodayDateStr();
    const record = await Attendance.findOne({ userId: req.user.id, date: today });
    res.json(record || { status: 'idle' });
});
app.post('/api/attendance/checkin', authMiddleware, async (req, res) => {
    const today = getTodayDateStr();
    const existing = await Attendance.findOne({ userId: req.user.id, date: today });
    if (existing) return res.status(400).json({ message: "Checked in" });
    const newRecord = new Attendance({ userId: req.user.id, date: today });
    await newRecord.save();
    res.json(newRecord);
});
app.put('/api/attendance/checkout', authMiddleware, async (req, res) => {
    const today = getTodayDateStr();
    const record = await Attendance.findOne({ userId: req.user.id, date: today });
    if (!record) return res.status(400).json({ message: "No record" });
    record.checkOut = Date.now(); record.status = 'completed';
    await record.save(); res.json(record);
});
app.get('/api/attendance/today', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    const today = getTodayDateStr();
    const users = await User.find({ role: 'worker' }, '-password');
    const attendances = await Attendance.find({ date: today });
    const result = users.map(user => {
      const att = attendances.find(a => a.userId.toString() === user._id.toString());
      return { _id: user._id, username: user.username, attendance: att || null };
    });
    res.json(result);
});
app.put('/api/attendance/reset/:userId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    const today = getTodayDateStr();
    const record = await Attendance.findOne({ userId: req.params.userId, date: today });
    if (!record) return res.status(404).json({ message: "No record" });
    record.checkOut = undefined; record.status = 'working';
    await record.save(); res.json(record);
});
app.put('/api/attendance/edit/:userId', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    const { checkInTime, checkOutTime } = req.body;
    const today = getTodayDateStr();
    let record = await Attendance.findOne({ userId: req.params.userId, date: today });
    if (!record) record = new Attendance({ userId: req.params.userId, date: today });
    const mergeTime = (base, t) => { if(!t)return undefined; const [h,m]=t.split(':'); const d=new Date(base); d.setHours(h,m,0,0); return d; };
    const base = record.checkIn?new Date(record.checkIn):new Date();
    if(checkInTime) record.checkIn=mergeTime(base,checkInTime);
    if(checkOutTime) { record.checkOut=mergeTime(base,checkOutTime); record.status='completed'; }
    else if(checkOutTime==="") { record.checkOut=undefined; record.status='working'; }
    await record.save(); res.json(record);
});

app.get('/api/logs', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
    const { date } = req.query;
    const { start, end } = date ? getDateRange(date) : getTodayRange();
    const logs = await Queue.find({ createdAt: { $gte: start, $lt: end } }).sort({ createdAt: -1 });
    res.json(logs);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));