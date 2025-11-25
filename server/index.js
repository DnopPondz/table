const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const rateLimit = require('express-rate-limit');


const Attendance = require('./models/Attendance');
const Queue = require('./models/Queue');
const Reservation = require('./models/Reservation');
const User = require('./models/User');
const Table = require('./models/Table');
const Shift = require('./models/Shift');
const Setting = require('./models/Setting');

dotenv.config();

// --- ENV VALIDATION ---
if (!process.env.MONGO_URI) {
  throw new Error("FATAL ERROR: MONGO_URI is not defined.");
}
if (!process.env.JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET is not defined.");
}

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// --- RATE LIMITING ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: "Too many login attempts from this IP, please try again after 15 minutes"
});

// --- SERVER & SOCKET SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

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

// --- CRON JOBS ---
cron.schedule('* * * * *', async () => {
  try {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const result = await Attendance.updateMany(
      { status: 'working', checkIn: { $lte: eightHoursAgo } },
      { $set: { status: 'completed', checkOut: new Date() } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Auto-checkout: ${result.modifiedCount} users clocked out.`);
    }
  } catch (err) {
    console.error('Auto-checkout error:', err);
  }
});

// --- HELPERS ---
const getTodayDateStr = () => {
  const date = new Date();
  const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = date.toLocaleDateString('en-GB', options).split('/');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date.toISOString().split('T')[0];
};

const getTodayRange = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type).value;
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  const start = new Date(`${year}-${month}-${day}T00:00:00.000+07:00`);
  const end = new Date(`${year}-${month}-${day}T23:59:59.999+07:00`);
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

  // *** NEW: Broadcast Reservations ***
  // Get upcoming pending reservations (e.g. from now until end of day, or just all future pending)
  const now = new Date();
  const reservations = await Reservation.find({
    status: 'pending',
    reservationTime: { $gte: now } // Only future or current pending
  }).sort({ reservationTime: 1 }).populate('tableId');

  io.emit('update-data', { currentQueue, waitingQueues, totalToday, tables, reservations });
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

// --- RESERVATIONS ---
app.get('/api/reservations', authMiddleware, async (req, res) => {
    const now = new Date();
    // Get all pending future/today or past (if not cancelled/completed)?
    // Let's just get pending ones for now for the list
    const reservations = await Reservation.find({
        status: 'pending',
        reservationTime: { $gte: new Date(now.setHours(0,0,0,0)) }
    }).sort({ reservationTime: 1 }).populate('tableId');
    res.json(reservations);
});

app.post('/api/reservations', authMiddleware, async (req, res) => {
    try {
        const { customerName, customerPhone, reservationTime, pax, tableId } = req.body;
        // Fix: Handle empty tableId to avoid CastError
        const reservationData = { customerName, customerPhone, reservationTime, pax };
        if (tableId) reservationData.tableId = tableId;

        const newRes = new Reservation(reservationData);
        await newRes.save();

        // Optionally update table status to 'reserved' if it's close?
        // For now, let's just save.

        broadcastUpdate();
        res.json(newRes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/reservations/:id/cancel', authMiddleware, async (req, res) => {
    await Reservation.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    broadcastUpdate();
    res.json({ message: "Cancelled" });
});

app.put('/api/reservations/:id/checkin', authMiddleware, async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id);
        if (!reservation) return res.status(404).json({ message: "Not found" });
        if (reservation.status !== 'pending') return res.status(400).json({ message: "Not pending" });

        // 1. Create a Queue for this reservation (Immediate seating)
        // Find Price
        const priceSetting = await Setting.findOne({ key: 'pricePerHead' });
        const pricePerHead = priceSetting ? parseFloat(priceSetting.value) : 399;

        // Generate a queue number (maybe distinct? or just next available)
        // Let's use the normal sequence but status 'seated'
        const { start, end } = getTodayRange();
        const lastQueue = await Queue.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: -1 });
        const nextNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;

        const newQueue = new Queue({
            queueNumber: nextNumber,
            customerCount: reservation.pax,
            totalPrice: reservation.pax * pricePerHead,
            status: 'seated'
        });
        await newQueue.save();

        // 2. Update Table
        if (reservation.tableId) {
            await Table.findByIdAndUpdate(reservation.tableId, {
                status: 'occupied',
                currentQueueId: newQueue._id
            });
        }

        // 3. Update Reservation
        reservation.status = 'checked-in';
        await reservation.save();

        broadcastUpdate();
        res.json({ message: "Checked In", queue: newQueue });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      // Input Validation
      if (!username || typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ message: "Invalid username" });
      }
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ message: "Invalid password" });
      }

      const user = await User.findOne({ username });
      if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Invalid credentials" });
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