const express = require('express');
const { query, validationResult } = require('express-validator');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all lessons (public endpoint with optional auth)
router.get('/', optionalAuth, [
  query('language').optional().isLength({ min: 2, max: 5 }).withMessage('Valid language code required'),
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('search').optional().isLength({ max: 100 }).withMessage('Search term too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      language = 'es',
      difficulty,
      category,
      page = 1,
      limit = 20,
      search
    } = req.query;

    // Build query
    const query = {
      language,
      isPublished: true
    };

    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [lessons, totalLessons] = await Promise.all([
      Lesson.find(query)
        .select('title description difficulty level category thumbnailUrl xpReward estimatedDuration statistics isFree')
        .populate('vocabularyItems', 'word translation difficulty')
        .sort({ 'statistics.popularityScore': -1, level: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Lesson.countDocuments(query)
    ]);

    // If user is authenticated, get their progress
    let userProgress = null;
    if (req.user) {
      userProgress = await Progress.findOne({ 
        userId: req.user._id, 
        language 
      });
    }

    // Add user progress info to lessons
    const lessonsWithProgress = lessons.map(lesson => {
      const lessonObj = lesson.toObject();
      
      if (userProgress) {
        const progress = userProgress.lessonProgress.find(
          lp => lp.lessonId.toString() === lesson._id.toString()
        );
        
        lessonObj.userProgress = progress ? {
          status: progress.status,
          score: progress.score,
          attempts: progress.attempts,
          lastAttempt: progress.lastAttempt,
          completedAt: progress.completedAt
        } : null;

        // Check if user can access this lesson
        lessonObj.canAccess = lesson.canUserAccess(req.user);
        lessonObj.prerequisitesMet = lesson.checkPrerequisites(userProgress);
      } else {
        lessonObj.canAccess = lesson.isFree;
        lessonObj.prerequisitesMet = lesson.prerequisites.length === 0;
      }

      return lessonObj;
    });

    res.json({
      message: 'Lessons retrieved successfully',
      lessons: lessonsWithProgress,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalLessons / parseInt(limit)),
        totalLessons,
        hasNext: parseInt(page) * parseInt(limit) < totalLessons,
        hasPrev: parseInt(page) > 1
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

// Get lesson by ID
router.get('/:lessonId', optionalAuth, async (req, res) => {
  try {
    const { lessonId } = req.params;

    const lesson = await Lesson.findById(lessonId)
      .populate('vocabularyItems', 'word translation definition examples partOfSpeech')
      .populate('prerequisites', 'title level difficulty');

    if (!lesson) {
      return res.status(404).json({
        message: 'Lesson not found'
      });
    }

    if (!lesson.isPublished && (!req.user || req.user.role !== 'admin')) {
      return res.status(404).json({
        message: 'Lesson not found'
      });
    }

    // Check access permissions
    let canAccess = lesson.isFree;
    let prerequisitesMet = lesson.prerequisites.length === 0;
    let userProgress = null;

    if (req.user) {
      canAccess = lesson.canUserAccess(req.user);
      
      const progress = await Progress.findOne({ 
        userId: req.user._id, 
        language: lesson.language 
      });

      if (progress) {
        prerequisitesMet = lesson.checkPrerequisites(progress);
        const lessonProgress = progress.lessonProgress.find(
          lp => lp.lessonId.toString() === lesson._id.toString()
        );
        
        if (lessonProgress) {
          userProgress = {
            status: lessonProgress.status,
            score: lessonProgress.score,
            attempts: lessonProgress.attempts,
            timeSpent: lessonProgress.timeSpent,
            lastAttempt: lessonProgress.lastAttempt,
            completedAt: lessonProgress.completedAt
          };
        }
      }
    }

    const lessonData = {
      ...lesson.toObject(),
      canAccess,
      prerequisitesMet,
      userProgress
    };

    // If user can't access, limit the content
    if (!canAccess) {
      lessonData.content = {
        introduction: lesson.content.introduction,
        sections: lesson.content.sections.slice(0, 1), // Only first section
        summary: null
      };
      lessonData.exercises = lesson.exercises.slice(0, 2); // Only first 2 exercises
    }

    res.json({
      message: 'Lesson retrieved successfully',
      lesson: lessonData
    });

  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({
      message: 'Failed to retrieve lesson',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get popular lessons
router.get('/popular/:language', optionalAuth, async (req, res) => {
  try {
    const { language } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const lessons = await Lesson.getPopular(language, limit);

    // Add user progress if authenticated
    let lessonsWithProgress = lessons;
    if (req.user) {
      const userProgress = await Progress.findOne({ 
        userId: req.user._id, 
        language 
      });

      lessonsWithProgress = lessons.map(lesson => {
        const lessonObj = lesson.toObject();
        
        if (userProgress) {
          const progress = userProgress.lessonProgress.find(
            lp => lp.lessonId.toString() === lesson._id.toString()
          );
          
          lessonObj.userProgress = progress ? {
            status: progress.status,
            score: progress.score
          } : null;
        }

        lessonObj.canAccess = lesson.canUserAccess(req.user || { subscription: { type: 'free' } });
        return lessonObj;
      });
    }

    res.json({
      message: 'Popular lessons retrieved successfully',
      lessons: lessonsWithProgress
    });

  } catch (error) {
    console.error('Get popular lessons error:', error);
    res.status(500).json({
      message: 'Failed to retrieve popular lessons',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get recommended lessons for user
router.get('/recommendations/:language', authenticateToken, async (req, res) => {
  try {
    const { language } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    const userProgress = await Progress.findOne({ 
      userId: req.user._id, 
      language 
    });

    if (!userProgress) {
      // If no progress, recommend beginner lessons
      const beginnerLessons = await Lesson.find({
        language,
        difficulty: 'beginner',
        isPublished: true,
        level: { $lte: 5 }
      })
      .select('title description difficulty level category thumbnailUrl xpReward estimatedDuration')
      .sort({ level: 1 })
      .limit(limit);

      return res.json({
        message: 'Beginner recommendations retrieved',
        lessons: beginnerLessons.map(lesson => ({
          ...lesson.toObject(),
          canAccess: lesson.canUserAccess(req.user),
          userProgress: null
        }))
      });
    }

    const recommendations = await Lesson.getRecommendations(userProgress, language, limit);

    const lessonsWithAccess = recommendations.map(lesson => ({
      ...lesson.toObject(),
      canAccess: lesson.canUserAccess(req.user),
      prerequisitesMet: lesson.checkPrerequisites(userProgress),
      userProgress: null
    }));

    res.json({
      message: 'Lesson recommendations retrieved successfully',
      lessons: lessonsWithAccess
    });

  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      message: 'Failed to retrieve recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get lessons by difficulty
router.get('/difficulty/:language/:difficulty', optionalAuth, [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { language, difficulty } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      return res.status(400).json({
        message: 'Invalid difficulty level'
      });
    }

    const lessons = await Lesson.getByDifficulty(language, difficulty, limit);

    // Add user progress if authenticated
    let lessonsWithProgress = lessons;
    if (req.user) {
      const userProgress = await Progress.findOne({ 
        userId: req.user._id, 
        language 
      });

      lessonsWithProgress = lessons.map(lesson => {
        const lessonObj = lesson.toObject();
        
        if (userProgress) {
          const progress = userProgress.lessonProgress.find(
            lp => lp.lessonId.toString() === lesson._id.toString()
          );
          
          lessonObj.userProgress = progress ? {
            status: progress.status,
            score: progress.score
          } : null;
          
          lessonObj.prerequisitesMet = lesson.checkPrerequisites(userProgress);
        }

        lessonObj.canAccess = lesson.canUserAccess(req.user || { subscription: { type: 'free' } });
        return lessonObj;
      });
    }

    res.json({
      message: `${difficulty} lessons retrieved successfully`,
      lessons: lessonsWithProgress
    });

  } catch (error) {
    console.error('Get lessons by difficulty error:', error);
    res.status(500).json({
      message: 'Failed to retrieve lessons',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Search lessons
router.get('/search/:language', optionalAuth, [
  query('q').isLength({ min: 2, max: 100 }).withMessage('Search query must be between 2 and 100 characters'),
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  query('category').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { language } = req.params;
    const { q, difficulty, category, limit = 20 } = req.query;

    const filters = { limit: parseInt(limit) };
    if (difficulty) filters.difficulty = difficulty;
    if (category) filters.category = category;

    const lessons = await Lesson.searchLessons(q, language, filters);

    // Add user progress if authenticated
    let lessonsWithProgress = lessons;
    if (req.user) {
      const userProgress = await Progress.findOne({ 
        userId: req.user._id, 
        language 
      });

      lessonsWithProgress = lessons.map(lesson => {
        const lessonObj = lesson.toObject();
        
        if (userProgress) {
          const progress = userProgress.lessonProgress.find(
            lp => lp.lessonId.toString() === lesson._id.toString()
          );
          
          lessonObj.userProgress = progress ? {
            status: progress.status,
            score: progress.score
          } : null;
        }

        lessonObj.canAccess = lesson.canUserAccess(req.user || { subscription: { type: 'free' } });
        return lessonObj;
      });
    }

    res.json({
      message: 'Lesson search completed',
      lessons: lessonsWithProgress,
      searchQuery: q
    });

  } catch (error) {
    console.error('Search lessons error:', error);
    res.status(500).json({
      message: 'Failed to search lessons',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

