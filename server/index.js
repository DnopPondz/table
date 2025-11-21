const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Queue = require('./models/Queue');
const User = require('./models/User');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Config
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "secret_key_change_this";
const PRICE_PER_HEAD = 399; // ราคาบุฟเฟต์ต่อหัว

// DB Connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) { res.status(400).json({ message: "Invalid token" }); }
};

// --- AUTH & USERS (Admin Only) ---

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

// List Users
app.get('/api/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  const users = await User.find({}, '-password').sort({ createdAt: -1 });
  res.json(users);
});

// Add User
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

// Delete User
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});


// --- QUEUE & REPORTS ---

const getTodayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
};

app.get('/api/queue', async (req, res) => {
  const { start, end } = getTodayRange();
  const currentQueue = await Queue.findOne({ status: 'called', createdAt: { $gte: start, $lt: end } }).sort({ updatedAt: -1 });
  const waitingQueues = await Queue.find({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
  const totalToday = await Queue.countDocuments({ createdAt: { $gte: start, $lt: end } });
  res.json({ currentQueue, waitingQueues, totalToday });
});

app.post('/api/queue/add', authMiddleware, async (req, res) => {
  const { customerCount } = req.body;
  const { start, end } = getTodayRange();
  const lastQueue = await Queue.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: -1 });
  const nextNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;
  
  // คำนวณราคาตรงนี้
  const totalPrice = customerCount * PRICE_PER_HEAD;

  const newQueue = new Queue({ queueNumber: nextNumber, customerCount, totalPrice });
  await newQueue.save();
  res.json(newQueue);
});

app.put('/api/queue/next', authMiddleware, async (req, res) => {
  const { start, end } = getTodayRange();
  const nextQueue = await Queue.findOne({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
  if (!nextQueue) return res.status(400).json({ message: "No waiting queue" });
  nextQueue.status = 'called';
  await nextQueue.save();
  res.json(nextQueue);
});

app.put('/api/queue/update/:id', authMiddleware, async (req, res) => {
  const queue = await Queue.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  res.json(queue);
});

// DASHBOARD REPORTS (Admin Only)
app.get('/api/reports', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin only" });
  
  const now = new Date();
  const startToday = new Date(now.setHours(0,0,0,0));
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYear = new Date(now.getFullYear(), 0, 1);

  // Helper function for aggregation
  const getStats = async (fromDate) => {
    const result = await Queue.aggregate([
      { $match: { createdAt: { $gte: fromDate }, status: 'seated' } }, // นับเฉพาะคนที่นั่งทานแล้ว (Paid)
      { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" }, totalCustomers: { $sum: "$customerCount" } } }
    ]);
    return result[0] || { totalRevenue: 0, totalCustomers: 0 };
  };

  const [daily, monthly, yearly] = await Promise.all([
    getStats(startToday),
    getStats(startMonth),
    getStats(startYear)
  ]);

  res.json({ daily, monthly, yearly });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));