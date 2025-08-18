const express = require('express');
const { body, validationResult } = require('express-validator');
const Progress = require('../models/Progress');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get listening exercises for a language and difficulty
router.get('/exercises/:language/:difficulty', authenticateToken, async (req, res) => {
  try {
    const { language, difficulty } = req.params;
    const category = req.query.category || 'conversation';

    // Define listening exercises based on language and difficulty
    const exercises = {
      spanish: {
        beginner: {
          conversation: [
            {
              id: 'ls_sp_beg_conv_1',
              title: "En el Restaurante",
              audioUrl: "/audio/spanish/beginner/restaurant.mp3",
              transcript: "Camarero: ¡Buenas tardes! ¿Mesa para cuántas personas?\nCliente: Para dos personas, por favor.\nCamarero: Perfecto, síganme por favor. Aquí tienen la carta.\nCliente: Gracias. ¿Qué nos recomienda?\nCamarero: El pescado del día está muy bueno.",
              duration: 45,
              category: "Restaurant",
              questions: [
                {
                  id: "q1",
                  question: "¿Para cuántas personas es la mesa?",
                  options: ["Una persona", "Dos personas", "Tres personas", "Cuatro personas"],
                  correctAnswer: "Dos personas"
                },
                {
                  id: "q2",
                  question: "¿Qué recomienda el camarero?",
                  options: ["La carne", "El pescado del día", "La ensalada", "El postre"],
                  correctAnswer: "El pescado del día"
                }
              ]
            },
            {
              id: 'ls_sp_beg_conv_2',
              title: "Presentaciones",
              audioUrl: "/audio/spanish/beginner/introductions.mp3",
              transcript: "María: Hola, me llamo María. ¿Cómo te llamas?\nJuan: Mucho gusto, María. Yo soy Juan.\nMaría: ¿De dónde eres, Juan?\nJuan: Soy de México. ¿Y tú?\nMaría: Yo soy de España, de Madrid.",
              duration: 35,
              category: "Introductions",
              questions: [
                {
                  id: "q1",
                  question: "¿Cómo se llama la mujer?",
                  options: ["Ana", "María", "Carmen", "Isabel"],
                  correctAnswer: "María"
                },
                {
                  id: "q2",
                  question: "¿De dónde es Juan?",
                  options: ["España", "Argentina", "México", "Colombia"],
                  correctAnswer: "México"
                }
              ]
            }
          ],
          news: [
            {
              id: 'ls_sp_beg_news_1',
              title: "El Tiempo Hoy",
              audioUrl: "/audio/spanish/beginner/weather.mp3",
              transcript: "Buenos días. El pronóstico del tiempo para hoy: temperaturas máximas de 25 grados. Cielo despejado por la mañana, con algunas nubes por la tarde. No se esperan lluvias.",
              duration: 30,
              category: "Weather",
              questions: [
                {
                  id: "q1",
                  question: "¿Cuál es la temperatura máxima?",
                  options: ["20 grados", "25 grados", "30 grados", "35 grados"],
                  correctAnswer: "25 grados"
                }
              ]
            }
          ]
        },
        intermediate: {
          conversation: [
            {
              id: 'ls_sp_int_conv_1',
              title: "En la Oficina",
              audioUrl: "/audio/spanish/intermediate/office.mp3",
              transcript: "Jefe: Buenos días, necesito que termines el informe antes del viernes.\nEmpleado: Por supuesto, ya he avanzado bastante. ¿Hay algún aspecto específico en el que deba enfocarme?\nJefe: Sí, es importante incluir las estadísticas del último trimestre y las proyecciones para el próximo año.",
              duration: 60,
              category: "Business",
              questions: [
                {
                  id: "q1",
                  question: "¿Cuándo debe estar terminado el informe?",
                  options: ["Antes del lunes", "Antes del viernes", "Antes del miércoles", "La próxima semana"],
                  correctAnswer: "Antes del viernes"
                },
                {
                  id: "q2",
                  question: "¿Qué debe incluir el informe?",
                  options: ["Solo estadísticas", "Solo proyecciones", "Estadísticas y proyecciones", "Ninguna de las anteriores"],
                  correctAnswer: "Estadísticas y proyecciones"
                }
              ]
            }
          ]
        }
      },
      english: {
        beginner: {
          conversation: [
            {
              id: 'ls_en_beg_conv_1',
              title: "At the Coffee Shop",
              audioUrl: "/audio/english/beginner/coffee_shop.mp3",
              transcript: "Barista: Good morning! What can I get for you today?\nCustomer: Hi! I'd like a medium coffee, please.\nBarista: Would you like milk or sugar with that?\nCustomer: Just milk, please. No sugar.\nBarista: That'll be $3.50. Here you go!",
              duration: 40,
              category: "Shopping",
              questions: [
                {
                  id: "q1",
                  question: "What size coffee does the customer order?",
                  options: ["Small", "Medium", "Large", "Extra large"],
                  correctAnswer: "Medium"
                },
                {
                  id: "q2",
                  question: "How much does the coffee cost?",
                  options: ["$2.50", "$3.00", "$3.50", "$4.00"],
                  correctAnswer: "$3.50"
                }
              ]
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
      const listeningProgress = progress?.listeningProgress?.find(lp => lp.exerciseId === exercise.id);
      return {
        ...exercise,
        progress: listeningProgress ? {
          bestScore: listeningProgress.bestScore,
          totalAttempts: listeningProgress.totalAttempts,
          averageScore: listeningProgress.averageScore,
          isCompleted: listeningProgress.isCompleted,
          lastPracticed: listeningProgress.lastPracticed
        } : null
      };
    });

    res.json({
      message: 'Listening exercises retrieved successfully',
      exercises: exercisesWithProgress,
      language,
      difficulty,
      category
    });

  } catch (error) {
    console.error('Get listening exercises error:', error);
    res.status(500).json({
      message: 'Failed to retrieve listening exercises',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Submit listening practice attempt
router.post('/practice', authenticateToken, [
  body('exerciseId').isString().withMessage('Exercise ID required'),
  body('audioTitle').isString().withMessage('Audio title required'),
  body('audioUrl').isString().withMessage('Audio URL required'),
  body('transcript').isString().withMessage('Transcript required'),
  body('category').isString().withMessage('Category required'),
  body('difficulty').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Valid difficulty required'),
  body('language').isString().withMessage('Language required'),
  body('duration').isInt({ min: 0 }).withMessage('Duration must be positive'),
  body('comprehensionScore').isInt({ min: 0, max: 100 }).withMessage('Comprehension score must be 0-100'),
  body('questionsAnswered').isInt({ min: 0 }).withMessage('Questions answered must be positive'),
  body('correctAnswers').isInt({ min: 0 }).withMessage('Correct answers must be positive'),
  body('timeSpent').isInt({ min: 0 }).withMessage('Time spent must be positive'),
  body('completionRate').isInt({ min: 0, max: 100 }).withMessage('Completion rate must be 0-100'),
  body('answers').isArray().withMessage('Answers must be an array'),
  body('feedback').optional().isString().withMessage('Feedback must be a string')
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
      audioTitle,
      audioUrl,
      transcript,
      category,
      difficulty,
      language,
      duration,
      comprehensionScore,
      questionsAnswered,
      correctAnswers,
      timeSpent,
      completionRate,
      answers,
      feedback = ''
    } = req.body;

    const userId = req.user._id;

    // Get or create progress record
    let progress = await Progress.findOne({ userId, language });
    if (!progress) {
      progress = new Progress({
        userId,
        language,
        skillProgress: [
          { skill: 'listening', level: 0, xp: 0, accuracy: 0 }
        ]
      });
    }

    // Exercise data
    const exerciseData = {
      exerciseId,
      audioTitle,
      audioUrl,
      transcript,
      category,
      difficulty,
      duration
    };

    // Attempt data
    const attemptData = {
      comprehensionScore,
      questionsAnswered,
      correctAnswers,
      timeSpent,
      completionRate,
      answers,
      feedback
    };

    // Update listening progress
    const result = progress.updateListeningProgress(exerciseData, attemptData);
    
    // Calculate XP based on scores and completion
    const baseXP = Math.round(comprehensionScore / 10) + 5; // 5-15 XP based on comprehension
    const completionBonus = Math.round(completionRate / 20); // 0-5 XP based on completion
    const xpReward = baseXP + completionBonus;
    
    // Update skill progress
    const skillUpdate = progress.updateSkillProgress('listening', xpReward, comprehensionScore);
    
    // Update daily progress
    progress.updateDailyProgress(xpReward, 'listening', Math.round(timeSpent / 60));
    
    // Update user XP
    req.user.addXP(xpReward);
    req.user.updateStreak();
    
    await Promise.all([progress.save(), req.user.save()]);

    // Generate feedback if not provided
    let generatedFeedback = feedback;
    if (!generatedFeedback) {
      if (comprehensionScore >= 90) {
        generatedFeedback = "Excellent listening comprehension! You understood almost everything perfectly.";
      } else if (comprehensionScore >= 70) {
        generatedFeedback = "Good job! Your listening skills are improving. Keep practicing with similar content.";
      } else if (comprehensionScore >= 50) {
        generatedFeedback = "Not bad! Try listening to the audio multiple times and focus on key words.";
      } else {
        generatedFeedback = "Keep practicing! Try starting with slower audio or reading the transcript first.";
      }
    }

    res.json({
      message: 'Listening practice recorded successfully',
      result: {
        comprehensionScore,
        xpEarned: xpReward,
        skillUpdate,
        newBestScore: result.newScore > (progress.listeningProgress.find(lp => lp.exerciseId === exerciseId)?.bestScore || 0),
        feedback: generatedFeedback,
        accuracy: questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Listening practice error:', error);
    res.status(500).json({
      message: 'Failed to record listening practice',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get listening progress statistics
router.get('/progress/:language', authenticateToken, async (req, res) => {
  try {
    const { language } = req.params;
    const userId = req.user._id;

    const progress = await Progress.findOne({ userId, language });

    if (!progress) {
      return res.json({
        message: 'No listening progress found',
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

    const listeningSkill = progress.skillProgress.find(sp => sp.skill === 'listening');
    const recentAttempts = [];

    // Collect recent attempts from all exercises
    progress.listeningProgress.forEach(exercise => {
      exercise.attempts.forEach(attempt => {
        recentAttempts.push({
          exerciseId: exercise.exerciseId,
          audioTitle: exercise.audioTitle,
          category: exercise.category,
          difficulty: exercise.difficulty,
          score: attempt.comprehensionScore,
          date: attempt.attemptDate,
          feedback: attempt.feedback,
          accuracy: attempt.questionsAnswered > 0 ? Math.round((attempt.correctAnswers / attempt.questionsAnswered) * 100) : 0
        });
      });
    });

    // Sort by date and take last 10
    recentAttempts.sort((a, b) => new Date(b.date) - new Date(a.date));
    const limitedRecentAttempts = recentAttempts.slice(0, 10);

    const progressStats = {
      totalExercises: progress.listeningProgress.length,
      completedExercises: progress.statistics.listeningExercisesCompleted,
      averageScore: progress.statistics.averageListeningScore,
      totalAttempts: progress.listeningProgress.reduce((sum, lp) => sum + lp.totalAttempts, 0),
      recentAttempts: limitedRecentAttempts,
      skillLevel: listeningSkill?.level || 0,
      skillXP: listeningSkill?.xp || 0,
      skillAccuracy: listeningSkill?.accuracy || 0
    };

    res.json({
      message: 'Listening progress retrieved successfully',
      progress: progressStats
    });

  } catch (error) {
    console.error('Get listening progress error:', error);
    res.status(500).json({
      message: 'Failed to retrieve listening progress',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

