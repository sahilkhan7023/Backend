const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Progress = require('../models/Progress');
const Lesson = require('../models/Lesson');
const VocabItem = require('../models/VocabItem');
const { Quiz, QuizAttempt } = require('../models/Quiz');
const Subscription = require('../models/Subscription');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Admin Dashboard Analytics
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalLessons,
      totalQuizzes,
      subscriptionStats,
      recentActivity
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ 
        isActive: true, 
        lastActiveDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
      }),
      Lesson.countDocuments({ isPublished: true }),
      Quiz.countDocuments({ isPublished: true }),
      Subscription.getUsageStats(),
      User.find({ isActive: true })
        .sort({ lastActiveDate: -1 })
        .limit(10)
        .select('username email lastActiveDate totalXP')
    ]);

    // Calculate revenue
    const totalRevenue = subscriptionStats.reduce((sum, stat) => sum + (stat.totalRevenue || 0), 0);

    // Get user growth data (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    const analytics = {
      overview: {
        totalUsers,
        activeUsers,
        totalLessons,
        totalQuizzes,
        totalRevenue: totalRevenue / 100, // Convert from cents
        conversionRate: totalUsers > 0 ? ((totalUsers - subscriptionStats.find(s => s._id === 'free')?.count || 0) / totalUsers * 100).toFixed(2) : 0
      },
      subscriptionStats,
      userGrowth,
      recentActivity: recentActivity.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        lastActive: user.lastActiveDate,
        totalXP: user.totalXP
      }))
    };

    res.json({
      message: 'Admin dashboard data retrieved successfully',
      analytics
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      message: 'Failed to retrieve dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// User Management
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isLength({ max: 100 }).withMessage('Search term too long'),
  query('role').optional().isIn(['user', 'admin', 'moderator']).withMessage('Invalid role'),
  query('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, role, status } = req.query;

    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    if (status) query.isActive = status === 'active';

    const [users, totalUsers] = await Promise.all([
      User.find(query)
        .select('-password -emailVerificationToken -passwordResetToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    // Get subscription info for each user
    const userIds = users.map(user => user._id);
    const subscriptions = await Subscription.find({ userId: { $in: userIds } });
    const subscriptionMap = subscriptions.reduce((map, sub) => {
      map[sub.userId.toString()] = sub;
      return map;
    }, {});

    const usersWithSubscriptions = users.map(user => ({
      ...user.toJSON(),
      subscription: subscriptionMap[user._id.toString()] || null
    }));

    res.json({
      message: 'Users retrieved successfully',
      users: usersWithSubscriptions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasNext: page * limit < totalUsers,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      message: 'Failed to retrieve users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update user
router.put('/users/:userId', [
  body('role').optional().isIn(['user', 'admin', 'moderator']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('totalXP').optional().isInt({ min: 0 }).withMessage('totalXP must be non-negative'),
  body('currentStreak').optional().isInt({ min: 0 }).withMessage('currentStreak must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const updates = req.body;

    // Prevent self-demotion
    if (userId === req.user._id.toString() && updates.role && updates.role !== 'admin') {
      return res.status(400).json({
        message: 'Cannot change your own admin role'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.json({
      message: 'User updated successfully',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        message: 'Cannot delete your own account'
      });
    }

    // Soft delete - deactivate instead of removing
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isActive: false,
        email: `deleted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@deleted.com`,
        username: `deleted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Cancel subscription
    await Subscription.findOneAndUpdate(
      { userId },
      { status: 'canceled', canceledAt: new Date() }
    );

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Lesson Management
router.get('/lessons', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('language').optional().isLength({ min: 2, max: 5 }),
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  query('category').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { language, difficulty, category } = req.query;

    const query = {};
    if (language) query.language = language;
    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;

    const [lessons, totalLessons] = await Promise.all([
      Lesson.find(query)
        .populate('createdBy', 'username email')
        .populate('vocabularyItems', 'word translation')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Lesson.countDocuments(query)
    ]);

    res.json({
      message: 'Lessons retrieved successfully',
      lessons,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalLessons / limit),
        totalLessons,
        hasNext: page * limit < totalLessons,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({
      message: 'Failed to retrieve lessons',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create lesson
router.post('/lessons', [
  body('title').isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('description').isLength({ min: 1, max: 1000 }).withMessage('Description must be between 1 and 1000 characters'),
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  body('category').isIn(['grammar', 'vocabulary', 'conversation', 'pronunciation', 'listening', 'reading', 'writing', 'culture', 'business']),
  body('difficulty').isIn(['beginner', 'intermediate', 'advanced']),
  body('level').isInt({ min: 1, max: 100 }).withMessage('Level must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const lessonData = {
      ...req.body,
      createdBy: req.user._id
    };

    const lesson = new Lesson(lessonData);
    await lesson.save();

    const populatedLesson = await Lesson.findById(lesson._id)
      .populate('createdBy', 'username email')
      .populate('vocabularyItems', 'word translation');

    res.status(201).json({
      message: 'Lesson created successfully',
      lesson: populatedLesson
    });

  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({
      message: 'Failed to create lesson',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update lesson
router.put('/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const updates = {
      ...req.body,
      lastModifiedBy: req.user._id
    };

    const lesson = await Lesson.findByIdAndUpdate(
      lessonId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('createdBy', 'username email')
     .populate('vocabularyItems', 'word translation');

    if (!lesson) {
      return res.status(404).json({
        message: 'Lesson not found'
      });
    }

    res.json({
      message: 'Lesson updated successfully',
      lesson
    });

  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({
      message: 'Failed to update lesson',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete lesson
router.delete('/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;

    const lesson = await Lesson.findByIdAndDelete(lessonId);

    if (!lesson) {
      return res.status(404).json({
        message: 'Lesson not found'
      });
    }

    // Remove lesson from user progress
    await Progress.updateMany(
      { 'lessonProgress.lessonId': lessonId },
      { $pull: { lessonProgress: { lessonId } } }
    );

    res.json({
      message: 'Lesson deleted successfully'
    });

  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({
      message: 'Failed to delete lesson',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Vocabulary Management
router.get('/vocabulary', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('language').optional().isLength({ min: 2, max: 5 }),
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  query('category').optional().isString()
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { language, difficulty, category } = req.query;

    const query = { isActive: true };
    if (language) query.language = language;
    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;

    const [vocabItems, totalItems] = await Promise.all([
      VocabItem.find(query)
        .populate('createdBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      VocabItem.countDocuments(query)
    ]);

    res.json({
      message: 'Vocabulary items retrieved successfully',
      vocabItems,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        hasNext: page * limit < totalItems,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get vocabulary error:', error);
    res.status(500).json({
      message: 'Failed to retrieve vocabulary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Subscription Management
router.get('/subscriptions', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('plan').optional().isIn(['free', 'premium', 'pro']),
  query('status').optional().isString()
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { plan, status } = req.query;

    const query = {};
    if (plan) query.plan = plan;
    if (status) query.status = status;

    const [subscriptions, totalSubscriptions] = await Promise.all([
      Subscription.find(query)
        .populate('userId', 'username email firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Subscription.countDocuments(query)
    ]);

    res.json({
      message: 'Subscriptions retrieved successfully',
      subscriptions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalSubscriptions / limit),
        totalSubscriptions,
        hasNext: page * limit < totalSubscriptions,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({
      message: 'Failed to retrieve subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// System Settings
router.get('/settings', async (req, res) => {
  try {
    // This would typically come from a settings collection
    // For now, return some default settings
    const settings = {
      aiPrompts: {
        general: "You are an AI language tutor helping students learn languages.",
        grammar: "You are an AI grammar tutor. Help students understand grammar rules.",
        vocabulary: "You are an AI vocabulary tutor. Help students learn new words.",
        pronunciation: "You are an AI pronunciation coach.",
        conversation: "You are an AI conversation partner."
      },
      features: {
        aiChatEnabled: true,
        voiceRecognitionEnabled: true,
        offlineModeEnabled: true,
        pushNotificationsEnabled: true
      },
      limits: {
        freeUserLessonsPerDay: 3,
        freeUserAiChatsPerDay: 10,
        premiumUserLessonsPerDay: 20,
        premiumUserAiChatsPerDay: 100
      }
    };

    res.json({
      message: 'Settings retrieved successfully',
      settings
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      message: 'Failed to retrieve settings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update system settings
router.put('/settings', async (req, res) => {
  try {
    const { settings } = req.body;

    // In a real application, you would save these to a settings collection
    // For now, just return success
    
    res.json({
      message: 'Settings updated successfully',
      settings
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      message: 'Failed to update settings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

