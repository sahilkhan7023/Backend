const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Progress = require('../models/Progress');
const Subscription = require('../models/Subscription');
const { Quiz, QuizAttempt } = require('../models/Quiz');
const { authenticateToken, checkFeatureAccess } = require('../middleware/auth');

const router = express.Router();

// Get user dashboard data
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const language = req.query.language || req.user.targetLanguages[0]?.language || 'es';

    // Get user progress
    const progress = await Progress.findOne({ userId, language })
      .populate('lessonProgress.lessonId', 'title difficulty category thumbnailUrl')
      .populate('vocabularyProgress.wordId', 'word translation');

    // Get subscription info
    const subscription = await Subscription.findOne({ userId });

    // Get recent quiz attempts
    const recentQuizzes = await QuizAttempt.find({ userId })
      .sort({ completedAt: -1 })
      .limit(5)
      .populate('quizId', 'title type difficulty');

    // Calculate dashboard stats
    const dashboardData = {
      user: {
        ...req.user.toJSON(),
        subscription: subscription ? {
          plan: subscription.plan,
          status: subscription.status,
          features: subscription.features,
          usage: subscription.usage
        } : null
      },
      progress: progress || {
        language,
        lessonProgress: [],
        skillProgress: [],
        vocabularyProgress: [],
        dailyProgress: [],
        weeklyGoals: {
          xpTarget: 1000,
          lessonsTarget: 7,
          timeTarget: 210,
          currentWeekXP: 0,
          currentWeekLessons: 0,
          currentWeekTime: 0
        },
        statistics: {
          totalLessonsCompleted: 0,
          totalTimeSpent: 0,
          averageScore: 0,
          wordsLearned: 0
        }
      },
      recentActivity: recentQuizzes,
      streakInfo: {
        current: req.user.currentStreak,
        longest: req.user.longestStreak,
        lastActive: req.user.lastActiveDate
      }
    };

    res.json({
      message: 'Dashboard data retrieved successfully',
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      message: 'Failed to retrieve dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user progress for specific language
router.get('/progress/:language', authenticateToken, async (req, res) => {
  try {
    const { language } = req.params;
    const userId = req.user._id;

    const progress = await Progress.getUserProgress(userId, language);

    if (!progress) {
      // Create initial progress record
      const newProgress = new Progress({
        userId,
        language,
        skillProgress: [
          { skill: 'listening', level: 0, xp: 0, accuracy: 0 },
          { skill: 'speaking', level: 0, xp: 0, accuracy: 0 },
          { skill: 'reading', level: 0, xp: 0, accuracy: 0 },
          { skill: 'writing', level: 0, xp: 0, accuracy: 0 },
          { skill: 'grammar', level: 0, xp: 0, accuracy: 0 },
          { skill: 'vocabulary', level: 0, xp: 0, accuracy: 0 }
        ]
      });
      await newProgress.save();
      
      return res.json({
        message: 'Progress initialized',
        progress: newProgress
      });
    }

    res.json({
      message: 'Progress retrieved successfully',
      progress
    });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({
      message: 'Failed to retrieve progress',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update lesson progress
router.post('/progress/lesson', authenticateToken, [
  body('lessonId').isMongoId().withMessage('Valid lesson ID required'),
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  body('score').isInt({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100'),
  body('timeSpent').isInt({ min: 0 }).withMessage('Time spent must be a positive number'),
  body('skillsUsed').optional().isArray().withMessage('Skills used must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { lessonId, language, score, timeSpent, skillsUsed = [] } = req.body;
    const userId = req.user._id;

    // Get or create progress
    let progress = await Progress.findOne({ userId, language });
    if (!progress) {
      progress = new Progress({ userId, language });
    }

    // Update lesson progress
    progress.updateLessonProgress(lessonId, score, timeSpent);

    // Update skill progress
    const xpPerSkill = Math.floor(score / skillsUsed.length) || score;
    const skillUpdates = [];
    
    for (const skill of skillsUsed) {
      const skillUpdate = progress.updateSkillProgress(skill, xpPerSkill, score);
      if (skillUpdate.leveledUp) {
        skillUpdates.push(skillUpdate);
      }
    }

    // Update daily progress
    progress.updateDailyProgress(score, 'lesson', timeSpent);

    // Update user XP and level
    const userUpdate = req.user.addXP(score);
    req.user.updateStreak();
    await req.user.save();

    // Update subscription usage
    const subscription = await Subscription.findOne({ userId });
    if (subscription) {
      subscription.incrementUsage('lessonsCompleted');
      await subscription.save();
    }

    await progress.save();

    res.json({
      message: 'Lesson progress updated successfully',
      progress: {
        lessonProgress: progress.lessonProgress.find(lp => lp.lessonId.toString() === lessonId),
        skillUpdates,
        userUpdate,
        totalXP: req.user.totalXP,
        currentLevel: req.user.level,
        currentStreak: req.user.currentStreak
      }
    });

  } catch (error) {
    console.error('Update lesson progress error:', error);
    res.status(500).json({
      message: 'Failed to update lesson progress',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get leaderboard
router.get('/leaderboard', authenticateToken, [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('timeframe').optional().isIn(['daily', 'weekly', 'monthly', 'all']).withMessage('Invalid timeframe')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const timeframe = req.query.timeframe || 'all';

    let leaderboard;
    
    if (timeframe === 'all') {
      leaderboard = await User.getLeaderboard(limit);
    } else {
      // For time-based leaderboards, we'd need to aggregate progress data
      // This is a simplified version
      leaderboard = await User.find({ 
        isActive: true, 
        'preferences.privacy.showInLeaderboard': true 
      })
      .select('username avatar totalXP currentStreak level badges')
      .sort({ totalXP: -1 })
      .limit(limit);
    }

    // Find current user's rank
    const userRank = await User.countDocuments({
      isActive: true,
      'preferences.privacy.showInLeaderboard': true,
      totalXP: { $gt: req.user.totalXP }
    }) + 1;

    res.json({
      message: 'Leaderboard retrieved successfully',
      leaderboard: leaderboard.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        avatar: user.avatar,
        totalXP: user.totalXP,
        currentStreak: user.currentStreak,
        level: user.level,
        badges: user.badges.slice(0, 3) // Show top 3 badges
      })),
      userRank,
      totalUsers: await User.countDocuments({ 
        isActive: true, 
        'preferences.privacy.showInLeaderboard': true 
      })
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({
      message: 'Failed to retrieve leaderboard',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user statistics
router.get('/statistics', authenticateToken, [
  query('language').optional().isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  query('timeframe').optional().isIn(['week', 'month', 'year', 'all']).withMessage('Invalid timeframe')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const language = req.query.language || req.user.targetLanguages[0]?.language || 'es';
    const timeframe = req.query.timeframe || 'all';
    const userId = req.user._id;

    // Get progress data
    const progress = await Progress.findOne({ userId, language });
    
    // Get quiz attempts
    const quizAttempts = await QuizAttempt.find({ userId })
      .populate('quizId', 'title type difficulty category')
      .sort({ completedAt: -1 });

    // Calculate statistics
    const stats = {
      overview: {
        totalXP: req.user.totalXP,
        currentLevel: req.user.level,
        currentStreak: req.user.currentStreak,
        longestStreak: req.user.longestStreak,
        totalBadges: req.user.badges.length
      },
      progress: progress ? {
        lessonsCompleted: progress.statistics.totalLessonsCompleted,
        totalTimeSpent: progress.statistics.totalTimeSpent,
        averageScore: progress.statistics.averageScore,
        wordsLearned: progress.statistics.wordsLearned,
        skillProgress: progress.skillProgress
      } : null,
      quizzes: {
        totalAttempts: quizAttempts.length,
        completedQuizzes: quizAttempts.filter(qa => qa.status === 'completed').length,
        averageScore: quizAttempts.length > 0 
          ? quizAttempts.reduce((sum, qa) => sum + qa.score, 0) / quizAttempts.length 
          : 0,
        perfectScores: quizAttempts.filter(qa => qa.score === 100).length
      },
      dailyActivity: progress ? progress.dailyProgress.slice(-30) : [], // Last 30 days
      weeklyGoals: progress ? progress.weeklyGoals : null
    };

    res.json({
      message: 'Statistics retrieved successfully',
      statistics: stats
    });

  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({
      message: 'Failed to retrieve statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update weekly goals
router.put('/goals/weekly', authenticateToken, [
  body('language').isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  body('xpTarget').optional().isInt({ min: 0, max: 10000 }).withMessage('XP target must be between 0 and 10000'),
  body('lessonsTarget').optional().isInt({ min: 0, max: 50 }).withMessage('Lessons target must be between 0 and 50'),
  body('timeTarget').optional().isInt({ min: 0, max: 1000 }).withMessage('Time target must be between 0 and 1000 minutes')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { language, xpTarget, lessonsTarget, timeTarget } = req.body;
    const userId = req.user._id;

    let progress = await Progress.findOne({ userId, language });
    if (!progress) {
      progress = new Progress({ userId, language });
    }

    // Update goals
    if (xpTarget !== undefined) progress.weeklyGoals.xpTarget = xpTarget;
    if (lessonsTarget !== undefined) progress.weeklyGoals.lessonsTarget = lessonsTarget;
    if (timeTarget !== undefined) progress.weeklyGoals.timeTarget = timeTarget;

    await progress.save();

    res.json({
      message: 'Weekly goals updated successfully',
      weeklyGoals: progress.weeklyGoals
    });

  } catch (error) {
    console.error('Update goals error:', error);
    res.status(500).json({
      message: 'Failed to update weekly goals',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user badges
router.get('/badges', authenticateToken, async (req, res) => {
  try {
    const badges = req.user.badges.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

    res.json({
      message: 'Badges retrieved successfully',
      badges,
      totalBadges: badges.length
    });

  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({
      message: 'Failed to retrieve badges',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Search users (for social features)
router.get('/search', authenticateToken, [
  query('q').isLength({ min: 2, max: 50 }).withMessage('Search query must be between 2 and 50 characters'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { q, limit = 10 } = req.query;

    const users = await User.find({
      isActive: true,
      'preferences.privacy.showInLeaderboard': true,
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } }
      ]
    })
    .select('username firstName lastName avatar totalXP level currentStreak')
    .limit(parseInt(limit));

    res.json({
      message: 'User search completed',
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        avatar: user.avatar,
        totalXP: user.totalXP,
        level: user.level,
        currentStreak: user.currentStreak
      }))
    });

  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({
      message: 'Failed to search users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

