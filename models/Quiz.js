const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  // Basic Info
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  language: {
    type: String,
    required: true
  },
  
  // Quiz Settings
  type: {
    type: String,
    enum: ['lesson_quiz', 'practice_quiz', 'placement_test', 'daily_challenge', 'vocabulary_review'],
    required: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  category: {
    type: String,
    enum: [
      'grammar', 'vocabulary', 'listening', 'reading', 
      'pronunciation', 'conversation', 'mixed'
    ],
    required: true
  },
  
  // Questions
  questions: [{
    type: {
      type: String,
      enum: [
        'multiple_choice', 'true_false', 'fill_blank', 'matching', 
        'ordering', 'speaking', 'listening', 'translation', 'image_choice'
      ],
      required: true
    },
    question: {
      type: String,
      required: true
    },
    options: [String], // For multiple choice, matching, etc.
    correctAnswer: mongoose.Schema.Types.Mixed,
    explanation: String,
    points: {
      type: Number,
      default: 10
    },
    timeLimit: {
      type: Number, // in seconds
      default: 30
    },
    
    // Media
    audioUrl: String,
    imageUrl: String,
    videoUrl: String,
    
    // Metadata
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    tags: [String],
    vocabularyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabItem'
    }
  }],
  
  // Quiz Configuration
  settings: {
    timeLimit: {
      type: Number, // in minutes, 0 = no limit
      default: 0
    },
    passingScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 70
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    shuffleQuestions: {
      type: Boolean,
      default: true
    },
    shuffleOptions: {
      type: Boolean,
      default: true
    },
    showCorrectAnswers: {
      type: Boolean,
      default: true
    },
    allowReview: {
      type: Boolean,
      default: true
    }
  },
  
  // Rewards
  rewards: {
    xp: {
      type: Number,
      default: 50
    },
    badges: [{
      name: String,
      description: String,
      icon: String,
      condition: String
    }]
  },
  
  // Associated Content
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  },
  vocabularyItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VocabItem'
  }],
  
  // Availability
  isPublished: {
    type: Boolean,
    default: false
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  availableFrom: Date,
  availableUntil: Date,
  
  // Statistics
  statistics: {
    totalAttempts: {
      type: Number,
      default: 0
    },
    totalCompletions: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    averageTime: {
      type: Number,
      default: 0
    },
    passRate: {
      type: Number,
      default: 0
    }
  },
  
  // Admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Quiz Attempt Schema (separate collection for attempts)
const quizAttemptSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Attempt Info
  attemptNumber: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'abandoned', 'expired'],
    default: 'in_progress'
  },
  
  // Answers
  answers: [{
    questionIndex: Number,
    userAnswer: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    pointsEarned: Number,
    timeSpent: Number // in seconds
  }],
  
  // Results
  score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  maxPoints: {
    type: Number,
    default: 0
  },
  timeSpent: {
    type: Number, // in seconds
    default: 0
  },
  passed: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  
  // Feedback
  feedback: {
    strengths: [String],
    weaknesses: [String],
    recommendations: [String]
  }
});

// Indexes
quizSchema.index({ language: 1, type: 1, difficulty: 1 });
quizSchema.index({ category: 1, isPublished: 1 });
quizSchema.index({ lessonId: 1 });

quizAttemptSchema.index({ userId: 1, quizId: 1 });
quizAttemptSchema.index({ completedAt: -1 });

// Pre-save middleware
quizSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Methods
quizSchema.methods.calculateMaxPoints = function() {
  return this.questions.reduce((total, question) => total + (question.points || 10), 0);
};

quizSchema.methods.canUserAccess = function(user) {
  // Check if quiz is available
  const now = new Date();
  if (this.availableFrom && now < this.availableFrom) return false;
  if (this.availableUntil && now > this.availableUntil) return false;
  
  // Check premium access
  if (this.isPremium && user.subscription.type === 'free') return false;
  
  return this.isPublished;
};

quizSchema.methods.updateStatistics = function(attempt) {
  this.statistics.totalAttempts += 1;
  
  if (attempt.status === 'completed') {
    this.statistics.totalCompletions += 1;
    
    // Update average score
    const totalScore = this.statistics.averageScore * (this.statistics.totalCompletions - 1) + attempt.score;
    this.statistics.averageScore = totalScore / this.statistics.totalCompletions;
    
    // Update average time
    const totalTime = this.statistics.averageTime * (this.statistics.totalCompletions - 1) + attempt.timeSpent;
    this.statistics.averageTime = totalTime / this.statistics.totalCompletions;
    
    // Update pass rate
    const totalPassed = this.statistics.passRate * (this.statistics.totalCompletions - 1) / 100 + (attempt.passed ? 1 : 0);
    this.statistics.passRate = (totalPassed / this.statistics.totalCompletions) * 100;
  }
};

// Quiz Attempt Methods
quizAttemptSchema.methods.calculateScore = function() {
  this.totalPoints = this.answers.reduce((total, answer) => total + (answer.pointsEarned || 0), 0);
  this.score = this.maxPoints > 0 ? Math.round((this.totalPoints / this.maxPoints) * 100) : 0;
  return this.score;
};

quizAttemptSchema.methods.generateFeedback = function(quiz) {
  const correctAnswers = this.answers.filter(a => a.isCorrect).length;
  const totalQuestions = this.answers.length;
  const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
  
  // Generate feedback based on performance
  this.feedback = {
    strengths: [],
    weaknesses: [],
    recommendations: []
  };
  
  if (accuracy >= 90) {
    this.feedback.strengths.push('Excellent understanding of the material');
    this.feedback.recommendations.push('Try more advanced topics');
  } else if (accuracy >= 70) {
    this.feedback.strengths.push('Good grasp of most concepts');
    this.feedback.recommendations.push('Review missed topics and try again');
  } else {
    this.feedback.weaknesses.push('Need more practice with basic concepts');
    this.feedback.recommendations.push('Review the lesson material before retrying');
  }
  
  // Analyze by question type
  const questionTypes = {};
  this.answers.forEach((answer, index) => {
    const question = quiz.questions[answer.questionIndex];
    if (!questionTypes[question.type]) {
      questionTypes[question.type] = { correct: 0, total: 0 };
    }
    questionTypes[question.type].total += 1;
    if (answer.isCorrect) {
      questionTypes[question.type].correct += 1;
    }
  });
  
  Object.keys(questionTypes).forEach(type => {
    const stats = questionTypes[type];
    const typeAccuracy = (stats.correct / stats.total) * 100;
    if (typeAccuracy < 60) {
      this.feedback.weaknesses.push(`Difficulty with ${type.replace('_', ' ')} questions`);
    }
  });
};

// Static methods
quizSchema.statics.getDailyChallenge = function(language, difficulty) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return this.findOne({
    language,
    difficulty,
    type: 'daily_challenge',
    isPublished: true,
    availableFrom: { $lte: today },
    $or: [
      { availableUntil: { $exists: false } },
      { availableUntil: { $gte: today } }
    ]
  });
};

const Quiz = mongoose.model('Quiz', quizSchema);
const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);

module.exports = { Quiz, QuizAttempt };

