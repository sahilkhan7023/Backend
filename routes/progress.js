const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Progress = require('../models/Progress');
const { Quiz, QuizAttempt } = require('../models/Quiz');
const VocabItem = require('../models/VocabItem');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All progress routes require authentication
router.use(authenticateToken);

// Get quiz by ID
router.get('/quiz/:quizId', async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findById(quizId)
      .populate('vocabularyItems', 'word translation definition')
      .populate('lessonId', 'title difficulty');

    if (!quiz) {
      return res.status(404).json({
        message: 'Quiz not found'
      });
    }

    if (!quiz.isPublished) {
      return res.status(404).json({
        message: 'Quiz not available'
      });
    }

    // Check if user can access this quiz
    if (!quiz.canUserAccess(req.user)) {
      return res.status(403).json({
        message: 'Premium subscription required to access this quiz',
        code: 'PREMIUM_REQUIRED'
      });
    }

    // Get user's previous attempts
    const attempts = await QuizAttempt.find({
      userId: req.user._id,
      quizId: quiz._id
    }).sort({ attemptNumber: -1 });

    // Check if user has exceeded max attempts
    if (attempts.length >= quiz.settings.maxAttempts) {
      return res.status(403).json({
        message: 'Maximum attempts exceeded',
        code: 'MAX_ATTEMPTS_EXCEEDED',
        maxAttempts: quiz.settings.maxAttempts,
        attempts: attempts.length
      });
    }

    // Prepare quiz data (without correct answers)
    const quizData = {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      type: quiz.type,
      difficulty: quiz.difficulty,
      category: quiz.category,
      settings: quiz.settings,
      rewards: quiz.rewards,
      questions: quiz.questions.map(q => ({
        type: q.type,
        question: q.question,
        options: q.options,
        points: q.points,
        timeLimit: q.timeLimit,
        audioUrl: q.audioUrl,
        imageUrl: q.imageUrl,
        videoUrl: q.videoUrl,
        difficulty: q.difficulty
      })),
      maxPoints: quiz.calculateMaxPoints(),
      previousAttempts: attempts.length,
      maxAttempts: quiz.settings.maxAttempts
    };

    res.json({
      message: 'Quiz retrieved successfully',
      quiz: quizData
    });

  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({
      message: 'Failed to retrieve quiz',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Start quiz attempt
router.post('/quiz/:quizId/start', async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id;

    const quiz = await Quiz.findById(quizId);
    if (!quiz || !quiz.isPublished) {
      return res.status(404).json({
        message: 'Quiz not found'
      });
    }

    if (!quiz.canUserAccess(req.user)) {
      return res.status(403).json({
        message: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Check existing attempts
    const existingAttempts = await QuizAttempt.countDocuments({
      userId,
      quizId
    });

    if (existingAttempts >= quiz.settings.maxAttempts) {
      return res.status(403).json({
        message: 'Maximum attempts exceeded',
        code: 'MAX_ATTEMPTS_EXCEEDED'
      });
    }

    // Check for existing in-progress attempt
    const inProgressAttempt = await QuizAttempt.findOne({
      userId,
      quizId,
      status: 'in_progress'
    });

    if (inProgressAttempt) {
      return res.json({
        message: 'Quiz attempt already in progress',
        attempt: {
          _id: inProgressAttempt._id,
          attemptNumber: inProgressAttempt.attemptNumber,
          startedAt: inProgressAttempt.startedAt,
          answers: inProgressAttempt.answers
        }
      });
    }

    // Create new attempt
    const attempt = new QuizAttempt({
      quizId,
      userId,
      attemptNumber: existingAttempts + 1,
      maxPoints: quiz.calculateMaxPoints(),
      answers: quiz.questions.map((_, index) => ({
        questionIndex: index,
        userAnswer: null,
        isCorrect: false,
        pointsEarned: 0,
        timeSpent: 0
      }))
    });

    await attempt.save();

    res.json({
      message: 'Quiz attempt started',
      attempt: {
        _id: attempt._id,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        maxPoints: attempt.maxPoints
      }
    });

  } catch (error) {
    console.error('Start quiz error:', error);
    res.status(500).json({
      message: 'Failed to start quiz',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Submit quiz answer
router.post('/quiz/:quizId/answer', [
  body('attemptId').isMongoId().withMessage('Valid attempt ID required'),
  body('questionIndex').isInt({ min: 0 }).withMessage('Valid question index required'),
  body('userAnswer').notEmpty().withMessage('Answer is required'),
  body('timeSpent').optional().isInt({ min: 0 }).withMessage('Time spent must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { quizId } = req.params;
    const { attemptId, questionIndex, userAnswer, timeSpent = 0 } = req.body;

    const [quiz, attempt] = await Promise.all([
      Quiz.findById(quizId),
      QuizAttempt.findById(attemptId)
    ]);

    if (!quiz || !attempt) {
      return res.status(404).json({
        message: 'Quiz or attempt not found'
      });
    }

    if (attempt.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({
        message: 'Quiz attempt is not in progress'
      });
    }

    if (questionIndex >= quiz.questions.length) {
      return res.status(400).json({
        message: 'Invalid question index'
      });
    }

    const question = quiz.questions[questionIndex];
    const answer = attempt.answers[questionIndex];

    // Check if answer is correct
    let isCorrect = false;
    if (question.type === 'multiple_choice') {
      isCorrect = userAnswer === question.correctAnswer;
    } else if (question.type === 'true_false') {
      isCorrect = userAnswer === question.correctAnswer;
    } else if (question.type === 'fill_blank') {
      const correctAnswers = Array.isArray(question.correctAnswer) 
        ? question.correctAnswer 
        : [question.correctAnswer];
      isCorrect = correctAnswers.some(correct => 
        userAnswer.toLowerCase().trim() === correct.toLowerCase().trim()
      );
    } else if (question.type === 'matching' || question.type === 'ordering') {
      isCorrect = JSON.stringify(userAnswer) === JSON.stringify(question.correctAnswer);
    }

    // Update answer
    answer.userAnswer = userAnswer;
    answer.isCorrect = isCorrect;
    answer.pointsEarned = isCorrect ? question.points : 0;
    answer.timeSpent = timeSpent;

    await attempt.save();

    res.json({
      message: 'Answer submitted successfully',
      result: {
        isCorrect,
        pointsEarned: answer.pointsEarned,
        explanation: quiz.settings.showCorrectAnswers ? question.explanation : null
      }
    });

  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({
      message: 'Failed to submit answer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Complete quiz attempt
router.post('/quiz/:quizId/complete', [
  body('attemptId').isMongoId().withMessage('Valid attempt ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { quizId } = req.params;
    const { attemptId } = req.body;

    const [quiz, attempt] = await Promise.all([
      Quiz.findById(quizId),
      QuizAttempt.findById(attemptId)
    ]);

    if (!quiz || !attempt) {
      return res.status(404).json({
        message: 'Quiz or attempt not found'
      });
    }

    if (attempt.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({
        message: 'Quiz attempt is not in progress'
      });
    }

    // Calculate final score
    const score = attempt.calculateScore();
    const passed = score >= quiz.settings.passingScore;

    // Update attempt
    attempt.status = 'completed';
    attempt.completedAt = new Date();
    attempt.passed = passed;
    attempt.timeSpent = attempt.answers.reduce((total, answer) => total + answer.timeSpent, 0);

    // Generate feedback
    attempt.generateFeedback(quiz);

    await attempt.save();

    // Update quiz statistics
    quiz.updateStatistics(attempt);
    await quiz.save();

    // Award XP and update user progress
    const xpReward = Math.floor(quiz.rewards.xp * (score / 100));
    req.user.addXP(xpReward);
    req.user.updateStreak();
    await req.user.save();

    // Update progress if this is a lesson quiz
    if (quiz.lessonId) {
      let progress = await Progress.findOne({ 
        userId: req.user._id, 
        language: quiz.language 
      });

      if (!progress) {
        progress = new Progress({ 
          userId: req.user._id, 
          language: quiz.language 
        });
      }

      progress.updateDailyProgress(xpReward, 'quiz', attempt.timeSpent / 60);
      await progress.save();
    }

    res.json({
      message: 'Quiz completed successfully',
      result: {
        score,
        passed,
        totalPoints: attempt.totalPoints,
        maxPoints: attempt.maxPoints,
        timeSpent: attempt.timeSpent,
        xpEarned: xpReward,
        feedback: attempt.feedback,
        correctAnswers: quiz.settings.showCorrectAnswers ? 
          quiz.questions.map((q, index) => ({
            questionIndex: index,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            userAnswer: attempt.answers[index].userAnswer,
            isCorrect: attempt.answers[index].isCorrect
          })) : null
      }
    });

  } catch (error) {
    console.error('Complete quiz error:', error);
    res.status(500).json({
      message: 'Failed to complete quiz',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user's quiz attempts
router.get('/quiz-attempts', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('status').optional().isIn(['in_progress', 'completed', 'abandoned'])
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
    const { status } = req.query;

    const query = { userId: req.user._id };
    if (status) query.status = status;

    const [attempts, totalAttempts] = await Promise.all([
      QuizAttempt.find(query)
        .populate('quizId', 'title type difficulty category')
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit),
      QuizAttempt.countDocuments(query)
    ]);

    res.json({
      message: 'Quiz attempts retrieved successfully',
      attempts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalAttempts / limit),
        totalAttempts,
        hasNext: page * limit < totalAttempts,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get quiz attempts error:', error);
    res.status(500).json({
      message: 'Failed to retrieve quiz attempts',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get daily challenge
router.get('/daily-challenge/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const difficulty = req.user.targetLanguages.find(tl => tl.language === language)?.level || 'beginner';

    const dailyChallenge = await Quiz.getDailyChallenge(language, difficulty);

    if (!dailyChallenge) {
      return res.status(404).json({
        message: 'No daily challenge available',
        code: 'NO_DAILY_CHALLENGE'
      });
    }

    // Check if user has already completed today's challenge
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingAttempt = await QuizAttempt.findOne({
      userId: req.user._id,
      quizId: dailyChallenge._id,
      completedAt: { $gte: today },
      status: 'completed'
    });

    const challengeData = {
      ...dailyChallenge.toObject(),
      alreadyCompleted: !!existingAttempt,
      completedAt: existingAttempt?.completedAt,
      score: existingAttempt?.score
    };

    // Remove correct answers from questions
    challengeData.questions = challengeData.questions.map(q => ({
      type: q.type,
      question: q.question,
      options: q.options,
      points: q.points,
      timeLimit: q.timeLimit,
      audioUrl: q.audioUrl,
      imageUrl: q.imageUrl,
      difficulty: q.difficulty
    }));

    res.json({
      message: 'Daily challenge retrieved successfully',
      challenge: challengeData
    });

  } catch (error) {
    console.error('Get daily challenge error:', error);
    res.status(500).json({
      message: 'Failed to retrieve daily challenge',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get vocabulary review
router.get('/vocabulary-review/:language', [
  query('count').optional().isInt({ min: 1, max: 50 }).withMessage('Count must be between 1 and 50')
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
    const count = parseInt(req.query.count) || 20;

    // Get user's vocabulary progress
    const progress = await Progress.findOne({ 
      userId: req.user._id, 
      language 
    });

    let vocabularyItems = [];

    if (progress && progress.vocabularyProgress.length > 0) {
      // Get words that need review (based on spaced repetition)
      const now = new Date();
      const wordsForReview = progress.vocabularyProgress
        .filter(vp => !vp.nextReview || vp.nextReview <= now)
        .sort((a, b) => (a.nextReview || new Date(0)) - (b.nextReview || new Date(0)))
        .slice(0, count);

      if (wordsForReview.length > 0) {
        const wordIds = wordsForReview
          .filter(vp => vp.wordId)
          .map(vp => vp.wordId);

        vocabularyItems = await VocabItem.find({
          _id: { $in: wordIds },
          isActive: true
        });
      }
    }

    // If not enough words from progress, get random words
    if (vocabularyItems.length < count) {
      const excludeIds = vocabularyItems.map(item => item._id);
      const additionalWords = await VocabItem.getRandomWords(
        count - vocabularyItems.length,
        req.user.targetLanguages.find(tl => tl.language === language)?.level,
        excludeIds
      );
      vocabularyItems = [...vocabularyItems, ...additionalWords];
    }

    res.json({
      message: 'Vocabulary review retrieved successfully',
      vocabularyItems: vocabularyItems.map(item => ({
        _id: item._id,
        word: item.word,
        translation: item.translation,
        definition: item.definition,
        partOfSpeech: item.partOfSpeech,
        examples: item.examples.slice(0, 2),
        difficulty: item.difficulty,
        category: item.category
      }))
    });

  } catch (error) {
    console.error('Get vocabulary review error:', error);
    res.status(500).json({
      message: 'Failed to retrieve vocabulary review',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

