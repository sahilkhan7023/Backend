const express = require('express');
const { body, validationResult } = require('express-validator');
const Progress = require('../models/Progress');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get speaking exercises for a language and difficulty
router.get('/exercises/:language/:difficulty', authenticateToken, async (req, res) => {
  try {
    const { language, difficulty } = req.params;
    const category = req.query.category || 'daily';

    // Define speaking exercises based on language and difficulty
    const exercises = {
      spanish: {
        beginner: {
          daily: [
            {
              id: 'sp_beg_daily_1',
              text: "Hola, ¿cómo estás?",
              phonetic: "/ˈola ˈkomo esˈtas/",
              translation: "Hello, how are you?",
              tips: "Focus on the rolled 'r' sound and the rising intonation at the end.",
              category: "Greetings"
            },
            {
              id: 'sp_beg_daily_2',
              text: "Muchas gracias por todo.",
              phonetic: "/ˈmutʃas ˈɣɾaθjas poɾ ˈtoðo/",
              translation: "Thank you very much for everything.",
              tips: "Practice the 'ch' sound in 'muchas' and the soft 'g' in 'gracias'.",
              category: "Politeness"
            },
            {
              id: 'sp_beg_daily_3',
              text: "¿Qué hora es?",
              phonetic: "/ˈke ˈoɾa es/",
              translation: "What time is it?",
              tips: "Clear pronunciation of 'qué' and rising intonation for questions.",
              category: "Time"
            }
          ],
          business: [
            {
              id: 'sp_beg_bus_1',
              text: "Buenos días a todos.",
              phonetic: "/ˈbwenos ˈðias a ˈtoðos/",
              translation: "Good morning everyone.",
              tips: "Professional tone with clear articulation of each word.",
              category: "Meetings"
            }
          ]
        },
        intermediate: {
          daily: [
            {
              id: 'sp_int_daily_1',
              text: "Me gustaría hacer una reserva para cenar.",
              phonetic: "/me ɣustaˈɾia aˈθeɾ ˈuna reˈseɾβa ˈpaɾa θeˈnaɾ/",
              translation: "I would like to make a reservation for dinner.",
              tips: "Practice the conditional 'gustaría' and clear enunciation.",
              category: "Restaurant"
            },
            {
              id: 'sp_int_daily_2',
              text: "¿Podría ayudarme con este problema, por favor?",
              phonetic: "/poˈðɾia aʝuˈðaɾme kon ˈeste pɾoˈβlema poɾ faˈβoɾ/",
              translation: "Could you help me with this problem, please?",
              tips: "Polite request with proper stress on 'por favor'.",
              category: "Requests"
            }
          ]
        }
      },
      english: {
        beginner: {
          daily: [
            {
              id: 'en_beg_daily_1',
              text: "Hello, how are you today?",
              phonetic: "/həˈloʊ, haʊ ɑr ju təˈdeɪ/",
              translation: "Hello, how are you today?",
              tips: "Focus on the 'h' sound in 'hello' and the rising intonation at the end.",
              category: "Greetings"
            },
            {
              id: 'en_beg_daily_2',
              text: "Thank you very much.",
              phonetic: "/θæŋk ju ˈvɛri mʌtʃ/",
              translation: "Thank you very much.",
              tips: "Practice the 'th' sound in 'thank' and stress 'very'.",
              category: "Politeness"
            }
          ]
        }
      }
    };

    const languageExercises = exercises[language]?.[difficulty]?.[category] || [];

    // Get user's progress for these exercises
    const userId = req.user._id;
    const progress = await Progress.findOne({ userId, language });
    
    const exercisesWithProgress = languageExercises.map(exercise => {
      const speakingProgress = progress?.speakingProgress?.find(sp => sp.exerciseId === exercise.id);
      return {
        ...exercise,
        progress: speakingProgress ? {
          bestScore: speakingProgress.bestScore,
          totalAttempts: speakingProgress.totalAttempts,
          averageScore: speakingProgress.averageScore,
          isCompleted: speakingProgress.isCompleted,
          lastPracticed: speakingProgress.lastPracticed
        } : null
      };
    });

    res.json({
      message: 'Speaking exercises retrieved successfully',
      exercises: exercisesWithProgress,
      language,
      difficulty,
      category
    });

  } catch (error) {
    console.error('Get speaking exercises error:', error);
    res.status(500).json({
      message: 'Failed to retrieve speaking exercises',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Submit speaking practice attempt
router.post('/practice', authenticateToken, [
  body('exerciseId').isString().withMessage('Exercise ID required'),
  body('exerciseText').isString().withMessage('Exercise text required'),
  body('category').isString().withMessage('Category required'),
  body('difficulty').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Valid difficulty required'),
  body('language').isString().withMessage('Language required'),
  body('pronunciationScore').isInt({ min: 0, max: 100 }).withMessage('Pronunciation score must be 0-100'),
  body('fluencyScore').isInt({ min: 0, max: 100 }).withMessage('Fluency score must be 0-100'),
  body('accuracyScore').isInt({ min: 0, max: 100 }).withMessage('Accuracy score must be 0-100'),
  body('recordingDuration').optional().isInt({ min: 0 }).withMessage('Recording duration must be positive'),
  body('feedback').optional().isString().withMessage('Feedback must be a string'),
  body('improvements').optional().isArray().withMessage('Improvements must be an array')
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
      exerciseId,
      exerciseText,
      category,
      difficulty,
      language,
      pronunciationScore,
      fluencyScore,
      accuracyScore,
      recordingDuration = 0,
      feedback = '',
      improvements = []
    } = req.body;

    const userId = req.user._id;

    // Get or create progress record
    let progress = await Progress.findOne({ userId, language });
    if (!progress) {
      progress = new Progress({
        userId,
        language,
        skillProgress: [
          { skill: 'speaking', level: 0, xp: 0, accuracy: 0 }
        ]
      });
    }

    // Exercise data
    const exerciseData = {
      exerciseId,
      exerciseText,
      category,
      difficulty
    };

    // Attempt data
    const attemptData = {
      pronunciationScore,
      fluencyScore,
      accuracyScore,
      recordingDuration,
      feedback,
      improvements
    };

    // Update speaking progress
    const result = progress.updateSpeakingProgress(exerciseData, attemptData);
    
    // Calculate XP based on scores
    const overallScore = Math.round((pronunciationScore + fluencyScore + accuracyScore) / 3);
    const xpReward = Math.round(overallScore / 10) + 5; // 5-15 XP based on performance
    
    // Update skill progress
    const skillUpdate = progress.updateSkillProgress('speaking', xpReward, overallScore);
    
    // Update daily progress
    progress.updateDailyProgress(xpReward, 'speaking', Math.round(recordingDuration / 60));
    
    // Update user XP
    req.user.addXP(xpReward);
    req.user.updateStreak();
    
    await Promise.all([progress.save(), req.user.save()]);

    res.json({
      message: 'Speaking practice recorded successfully',
      result: {
        overallScore,
        xpEarned: xpReward,
        skillUpdate,
        newBestScore: result.newScore > (progress.speakingProgress.find(sp => sp.exerciseId === exerciseId)?.bestScore || 0),
        feedback: feedback || `Great job! Your overall score was ${overallScore}%. ${overallScore >= 80 ? 'Excellent pronunciation!' : 'Keep practicing to improve your pronunciation.'}`
      }
    });

  } catch (error) {
    console.error('Speaking practice error:', error);
    res.status(500).json({
      message: 'Failed to record speaking practice',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get speaking progress statistics
router.get('/progress/:language', authenticateToken, async (req, res) => {
  try {
    const { language } = req.params;
    const userId = req.user._id;

    const progress = await Progress.findOne({ userId, language });

    if (!progress) {
      return res.json({
        message: 'No speaking progress found',
        progress: {
          totalExercises: 0,
          completedExercises: 0,
          averageScore: 0,
          totalAttempts: 0,
          recentAttempts: [],
          skillLevel: 0,
          skillXP: 0
        }
      });
    }

    const speakingSkill = progress.skillProgress.find(sp => sp.skill === 'speaking');
    const recentAttempts = [];

    // Collect recent attempts from all exercises
    progress.speakingProgress.forEach(exercise => {
      exercise.attempts.forEach(attempt => {
        recentAttempts.push({
          exerciseId: exercise.exerciseId,
          exerciseText: exercise.exerciseText,
          category: exercise.category,
          difficulty: exercise.difficulty,
          score: attempt.overallScore,
          date: attempt.attemptDate,
          feedback: attempt.feedback
        });
      });
    });

    // Sort by date and take last 10
    recentAttempts.sort((a, b) => new Date(b.date) - new Date(a.date));
    const limitedRecentAttempts = recentAttempts.slice(0, 10);

    const progressStats = {
      totalExercises: progress.speakingProgress.length,
      completedExercises: progress.statistics.speakingExercisesCompleted,
      averageScore: progress.statistics.averageSpeakingScore,
      totalAttempts: progress.speakingProgress.reduce((sum, sp) => sum + sp.totalAttempts, 0),
      recentAttempts: limitedRecentAttempts,
      skillLevel: speakingSkill?.level || 0,
      skillXP: speakingSkill?.xp || 0,
      skillAccuracy: speakingSkill?.accuracy || 0
    };

    res.json({
      message: 'Speaking progress retrieved successfully',
      progress: progressStats
    });

  } catch (error) {
    console.error('Get speaking progress error:', error);
    res.status(500).json({
      message: 'Failed to retrieve speaking progress',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

