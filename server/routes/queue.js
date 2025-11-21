const express = require('express');
const router = express.Router();
const Queue = require('../models/Queue');

// Middleware to verify reset logic (can be optimized, but simple check per request is fine for small scale)
const checkReset = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastQueue = await Queue.findOne().sort({ createdAt: -1 });

  // If no queue or last queue is from before today, we restart numbering from 1
  // But wait, we don't delete old data, we just start numbering from 1 for today.
  // So when adding a new queue, we check the Max queue number for TODAY.
};

// Get Queue Status (Client & Admin)
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find active queues for today
    const queues = await Queue.find({
      date: { $gte: today },
      status: { $in: ['waiting', 'serving'] }
    }).sort({ createdAt: 1 });

    const currentServing = await Queue.findOne({
      date: { $gte: today },
      status: 'serving'
    });

    const waitingCount = await Queue.countDocuments({
      date: { $gte: today },
      status: 'waiting'
    });

    res.json({
      queues,
      currentServing,
      waitingCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Queue
router.post('/', async (req, res) => {
  const { numberOfCustomers } = req.body;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the last queue number used TODAY
    const lastQueue = await Queue.findOne({ date: { $gte: today } }).sort({ queueNumber: -1 });

    let nextNumber = 1;
    if (lastQueue) {
      nextNumber = lastQueue.queueNumber + 1;
    }

    const newQueue = new Queue({
      queueNumber: nextNumber,
      numberOfCustomers,
      status: 'waiting'
    });

    await newQueue.save();
    res.status(201).json(newQueue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Call Next Queue (Update status to serving)
router.put('/next', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find currently serving and mark as completed (or just find it to handle it)
    // Requirement: "when table free customer will update queue by click update next queue"
    // Requirement: "delete that data from state data and click to next queue" is for CANCEL.
    // For "next queue", we assume the previous one is done (completed).

    const currentServing = await Queue.findOne({ date: { $gte: today }, status: 'serving' });
    if (currentServing) {
      currentServing.status = 'completed';
      await currentServing.save();
    }

    // Find next waiting
    const nextQueue = await Queue.findOne({ date: { $gte: today }, status: 'waiting' }).sort({ queueNumber: 1 });

    if (nextQueue) {
      nextQueue.status = 'serving';
      await nextQueue.save();
      res.json(nextQueue);
    } else {
      res.json({ message: 'No more queues waiting' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Accept Queue (Customer arrived)
router.put('/accept/:id', async (req, res) => {
  try {
    const queue = await Queue.findById(req.params.id);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });

    // "employee will accept that queue for keep data"
    // Usually "Accept" means they are seated. The previous step "next queue" puts them in 'serving' (called).
    // If they arrive, maybe we mark them as 'seated' or just leave them as 'serving' until next queue is called?
    // The prompt says: "if customer come and get their table employee will accept that queue for keep data"
    // This implies a confirmation step.
    // Let's assume 'serving' means "Called/Waiting for customer to walk up".
    // 'completed' means "Seated/Done with queue process".

    // Actually, simpler flow:
    // 1. Add -> 'waiting'
    // 2. Next -> 'serving' (Called)
    // 3. Accept -> 'completed' (Seated) OR Cancel -> 'cancelled'
    // If we click "Next Queue", the *previous* 'serving' one should probably be 'completed' automatically if not already?
    // Or does "Next Queue" just grab the next one?

    // Let's follow: "click update next queue" -> updates queue.
    // "if customer come ... employee will accept ... if wait 10-15 min ... click cancel"
    // So 'serving' is the state where they are being called.
    // 'accept' moves them to a "Seated" state (which I'll map to 'completed' effectively removing from active queue but keeping data).

    queue.status = 'completed';
    await queue.save();
    res.json(queue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel Queue
router.put('/cancel/:id', async (req, res) => {
  try {
    const queue = await Queue.findById(req.params.id);
    if (!queue) return res.status(404).json({ message: 'Queue not found' });

    // "delete that data from state data and click to next queue"
    // "delete from state data" -> set to 'cancelled' (so it disappears from active view)
    // "click to next queue" -> User has to manually click next, or should we auto trigger?
    // Prompt says: "click cancel it will delete that data from state data and click to next queue."
    // This might imply an auto-next, or just that the user will then click next.
    // Given it says "AND click to next queue", it sounds like two actions or one action doing two things.
    // I will make 'cancel' just cancel it. The UI can trigger 'next' if needed or user clicks it.
    // Safer to let user click 'next' again to avoid accidental auto-calls.

    queue.status = 'cancelled';
    await queue.save();

    res.json(queue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
