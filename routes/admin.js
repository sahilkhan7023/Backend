const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Progress = require('../models/Progress');
const Lesson = require('../models/Lesson');
const VocabItem = require('../models/VocabItem');
const { Quiz } = require('../models/Quiz');
const Subscription = require('../models/Subscription');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * ======================
 * Admin Login (Public)
 * ======================
 */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/login',
  adminLoginLimiter,
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { email, password } = req.body;
      const admin = await User.findOne({ email, role: 'admin' });
      if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

      const token = jwt.sign(
        { id: admin._id, role: 'admin' },
        process.env.JWT_SECRET || 'supersecret',
        { expiresIn: '1h' }
      );

      res.json({
        message: 'Admin login successful',
        admin: { id: admin._id, email: admin.email },
        token,
      });
    } catch (err) {
      console.error('Admin login error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * ======================
 * Protect all routes below
 * ======================
 */
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * Admin Dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalLessons,
      totalQuizzes,
      subscriptionStats,
      recentActivity,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({
        isActive: true,
        lastActiveDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      Lesson.countDocuments({ isPublished: true }),
      Quiz.countDocuments({ isPublished: true }),
      Subscription.getUsageStats(),
      User.find({ isActive: true })
        .sort({ lastActiveDate: -1 })
        .limit(10)
        .select('username email lastActiveDate totalXP'),
    ]);

    const totalRevenue = subscriptionStats.reduce(
      (sum, stat) => sum + (stat.totalRevenue || 0),
      0
    );

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    res.json({
      message: 'Admin dashboard data retrieved successfully',
      analytics: {
        overview: {
          totalUsers,
          activeUsers,
          totalLessons,
          totalQuizzes,
          totalRevenue: totalRevenue / 100,
        },
        subscriptionStats,
        userGrowth,
        recentActivity: recentActivity.map(u => ({
          id: u._id,
          username: u.username,
          email: u.email,
          lastActive: u.lastActiveDate,
          totalXP: u.totalXP,
        })),
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Failed to retrieve dashboard data' });
  }
});

/**
 * Users (list with subscriptions)
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
      User.find().skip(skip).limit(limit).select('-password'),
      User.countDocuments(),
    ]);

    const userIds = users.map(u => u._id);
    const subscriptions = await Subscription.find({ userId: { $in: userIds } });
    const subscriptionMap = subscriptions.reduce((map, sub) => {
      map[sub.userId.toString()] = sub;
      return map;
    }, {});

    const usersWithSubscriptions = users.map(user => ({
      ...user.toJSON(),
      subscription: subscriptionMap[user._id.toString()] || null,
    }));

    res.json({
      message: 'Users retrieved successfully',
      users: usersWithSubscriptions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasNext: page * limit < totalUsers,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to retrieve users' });
  }
});

// Update user
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    if (userId === req.user._id.toString() && updates.role && updates.role !== 'admin') {
      return res.status(400).json({ message: 'Cannot change your own admin role' });
    }

    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isActive: false,
        email: `deleted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@deleted.com`,
        username: `deleted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });

    await Subscription.findOneAndUpdate(
      { userId },
      { status: 'canceled', canceledAt: new Date() }
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

/**
 * Lessons
 */
router.get('/lessons', async (req, res) => {
  try {
    const lessons = await Lesson.find().populate('createdBy', 'username email');
    res.json({ message: 'Lessons retrieved successfully', lessons });
  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ message: 'Failed to retrieve lessons' });
  }
});

router.post('/lessons', async (req, res) => {
  try {
    const lesson = new Lesson({ ...req.body, createdBy: req.user._id });
    await lesson.save();
    res.status(201).json({ message: 'Lesson created successfully', lesson });
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ message: 'Failed to create lesson' });
  }
});

router.put('/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await Lesson.findByIdAndUpdate(
      lessonId,
      { $set: { ...req.body, lastModifiedBy: req.user._id } },
      { new: true }
    );
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    res.json({ message: 'Lesson updated successfully', lesson });
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ message: 'Failed to update lesson' });
  }
});

router.delete('/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    await Lesson.findByIdAndDelete(lessonId);
    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ message: 'Failed to delete lesson' });
  }
});

/**
 * Vocabulary
 */
router.get('/vocabulary', async (req, res) => {
  try {
    const vocabItems = await VocabItem.find().populate('createdBy', 'username');
    res.json({ message: 'Vocabulary items retrieved successfully', vocabItems });
  } catch (error) {
    console.error('Get vocabulary error:', error);
    res.status(500).json({ message: 'Failed to retrieve vocabulary' });
  }
});

/**
 * Subscriptions
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const subscriptions = await Subscription.find().populate('userId', 'username email');
    res.json({ message: 'Subscriptions retrieved successfully', subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ message: 'Failed to retrieve subscriptions' });
  }
});

/**
 * Settings
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = {
      aiPrompts: {
        general: "You are an AI language tutor.",
        grammar: "You are an AI grammar tutor.",
      },
      features: {
        aiChatEnabled: true,
        voiceRecognitionEnabled: true,
      },
      limits: {
        freeUserLessonsPerDay: 3,
        freeUserAiChatsPerDay: 10,
      },
    };
    res.json({ message: 'Settings retrieved successfully', settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to retrieve settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    res.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

module.exports = router;
