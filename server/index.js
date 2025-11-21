const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const Queue = require('./models/Queue');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Connect Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Helper: Get Today Range
const getTodayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
};

// GET STATUS
app.get('/api/queue', async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const currentQueue = await Queue.findOne({ status: 'called', createdAt: { $gte: start, $lt: end } }).sort({ updatedAt: -1 });
    const waitingQueues = await Queue.find({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
    const totalToday = await Queue.countDocuments({ createdAt: { $gte: start, $lt: end } });
    res.json({ currentQueue, waitingQueues, totalToday });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADD QUEUE
app.post('/api/queue/add', async (req, res) => {
  try {
    const { customerCount } = req.body;
    const { start, end } = getTodayRange();
    const lastQueue = await Queue.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: -1 });
    const nextNumber = lastQueue ? lastQueue.queueNumber + 1 : 1;
    const newQueue = new Queue({ queueNumber: nextNumber, customerCount });
    await newQueue.save();
    res.json(newQueue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEXT QUEUE
app.put('/api/queue/next', async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const nextQueue = await Queue.findOne({ status: 'waiting', createdAt: { $gte: start, $lt: end } }).sort({ queueNumber: 1 });
    if (!nextQueue) return res.status(400).json({ message: "No waiting queue" });
    
    // Auto cancel/complete previous called queues (Optional logic, usually manual is better)
    // await Queue.updateMany({ status: 'called' }, { status: 'cancelled' }); 

    nextQueue.status = 'called';
    await nextQueue.save();
    res.json(nextQueue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE STATUS (ACCEPT/CANCEL)
app.put('/api/queue/update/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const queue = await Queue.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(queue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));