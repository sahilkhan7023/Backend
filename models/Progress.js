const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  language: {
    type: String,
    required: true
  },
  
  // Lesson Progress
  lessonProgress: [{
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'mastered'],
      default: 'not_started'
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    attempts: {
      type: Number,
      default: 0
    },
    timeSpent: {
      type: Number, // in minutes
      default: 0
    },
    lastAttempt: Date,
    completedAt: Date,
    masteredAt: Date
  }],
  
  // Skill Progress
  skillProgress: [{
    skill: {
      type: String,
      enum: ['listening', 'speaking', 'reading', 'writing', 'grammar', 'vocabulary'],
      required: true
    },
    level: {
      type: Number,
      min: 0,
      max: 10,
      default: 0
    },
    xp: {
      type: Number,
      default: 0
    },
    accuracy: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    lastPracticed: Date
  }],
  
  // Vocabulary Progress
  vocabularyProgress: [{
    wordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VocabItem'
    },
    word: String,
    translation: String,
    strength: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    totalAnswers: {
      type: Number,
      default: 0
    },
    lastReviewed: Date,
    nextReview: Date,
    isLearned: {
      type: Boolean,
      default: false
    }
  }],
  
  // Daily Progress
  dailyProgress: [{
    date: {
      type: Date,
      required: true
    },
    xpEarned: {
      type: Number,
      default: 0
    },
    lessonsCompleted: {
      type: Number,
      default: 0
    },
    timeSpent: {
      type: Number, // in minutes
      default: 0
    },
    activitiesCompleted: [{
      type: {
        type: String,
        enum: ['lesson', 'quiz', 'chat', 'speaking', 'listening']
      },
      count: Number,
      xp: Number
    }]
  }],
  
  // Weekly Goals
  weeklyGoals: {
    xpTarget: {
      type: Number,
      default: 1000
    },
    lessonsTarget: {
      type: Number,
      default: 7
    },
    timeTarget: {
      type: Number, // in minutes
      default: 210 // 30 minutes per day
    },
    currentWeekXP: {
      type: Number,
      default: 0
    },
    currentWeekLessons: {
      type: Number,
      default: 0
    },
    currentWeekTime: {
      type: Number,
      default: 0
    },
    weekStartDate: {
      type: Date,
      default: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek;
        return new Date(now.setDate(diff));
      }
    }
  },
  
  // Statistics
  statistics: {
    totalLessonsCompleted: {
      type: Number,
      default: 0
    },
    totalTimeSpent: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    bestStreak: {
      type: Number,
      default: 0
    },
    wordsLearned: {
      type: Number,
      default: 0
    },
    perfectScores: {
      type: Number,
      default: 0
    }
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

// Indexes
progressSchema.index({ userId: 1, language: 1 }, { unique: true });
progressSchema.index({ 'lessonProgress.lessonId': 1 });
progressSchema.index({ 'dailyProgress.date': 1 });

// Pre-save middleware
progressSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Methods
progressSchema.methods.updateLessonProgress = function(lessonId, score, timeSpent) {
  const lessonProgress = this.lessonProgress.find(lp => lp.lessonId.toString() === lessonId.toString());
  
  if (lessonProgress) {
    lessonProgress.attempts += 1;
    lessonProgress.timeSpent += timeSpent;
    lessonProgress.lastAttempt = new Date();
    
    if (score > lessonProgress.score) {
      lessonProgress.score = score;
    }
    
    // Update status based on score
    if (score >= 90 && lessonProgress.attempts >= 2) {
      lessonProgress.status = 'mastered';
      lessonProgress.masteredAt = new Date();
    } else if (score >= 70) {
      lessonProgress.status = 'completed';
      lessonProgress.completedAt = new Date();
    } else {
      lessonProgress.status = 'in_progress';
    }
  } else {
    // Create new lesson progress
    const newProgress = {
      lessonId,
      score,
      attempts: 1,
      timeSpent,
      lastAttempt: new Date(),
      status: score >= 70 ? 'completed' : 'in_progress'
    };
    
    if (score >= 70) {
      newProgress.completedAt = new Date();
    }
    
    this.lessonProgress.push(newProgress);
  }
  
  this.updateStatistics();
};

progressSchema.methods.updateSkillProgress = function(skill, xpGained, accuracy) {
  let skillProgress = this.skillProgress.find(sp => sp.skill === skill);
  
  if (!skillProgress) {
    skillProgress = {
      skill,
      level: 0,
      xp: 0,
      accuracy: 0,
      lastPracticed: new Date()
    };
    this.skillProgress.push(skillProgress);
  }
  
  skillProgress.xp += xpGained;
  skillProgress.accuracy = (skillProgress.accuracy + accuracy) / 2; // Running average
  skillProgress.lastPracticed = new Date();
  
  // Level up calculation (every 500 XP = 1 level, max 10)
  const newLevel = Math.min(Math.floor(skillProgress.xp / 500), 10);
  if (newLevel > skillProgress.level) {
    skillProgress.level = newLevel;
    return { leveledUp: true, skill, newLevel };
  }
  
  return { leveledUp: false, skill, level: skillProgress.level };
};

progressSchema.methods.updateDailyProgress = function(xp, activityType, timeSpent = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let dailyProgress = this.dailyProgress.find(dp => 
    dp.date.getTime() === today.getTime()
  );
  
  if (!dailyProgress) {
    dailyProgress = {
      date: today,
      xpEarned: 0,
      lessonsCompleted: 0,
      timeSpent: 0,
      activitiesCompleted: []
    };
    this.dailyProgress.push(dailyProgress);
  }
  
  dailyProgress.xpEarned += xp;
  dailyProgress.timeSpent += timeSpent;
  
  if (activityType === 'lesson') {
    dailyProgress.lessonsCompleted += 1;
  }
  
  // Update activity count
  let activity = dailyProgress.activitiesCompleted.find(a => a.type === activityType);
  if (!activity) {
    activity = { type: activityType, count: 0, xp: 0 };
    dailyProgress.activitiesCompleted.push(activity);
  }
  activity.count += 1;
  activity.xp += xp;
  
  this.updateWeeklyProgress(xp, activityType, timeSpent);
};

progressSchema.methods.updateWeeklyProgress = function(xp, activityType, timeSpent) {
  const now = new Date();
  const weekStart = new Date(this.weeklyGoals.weekStartDate);
  const daysDiff = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));
  
  // Reset weekly progress if it's a new week
  if (daysDiff >= 7) {
    this.weeklyGoals.currentWeekXP = 0;
    this.weeklyGoals.currentWeekLessons = 0;
    this.weeklyGoals.currentWeekTime = 0;
    this.weeklyGoals.weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  }
  
  this.weeklyGoals.currentWeekXP += xp;
  this.weeklyGoals.currentWeekTime += timeSpent;
  
  if (activityType === 'lesson') {
    this.weeklyGoals.currentWeekLessons += 1;
  }
};

progressSchema.methods.updateStatistics = function() {
  const completedLessons = this.lessonProgress.filter(lp => 
    lp.status === 'completed' || lp.status === 'mastered'
  );
  
  this.statistics.totalLessonsCompleted = completedLessons.length;
  this.statistics.totalTimeSpent = this.lessonProgress.reduce((total, lp) => total + lp.timeSpent, 0);
  
  if (completedLessons.length > 0) {
    this.statistics.averageScore = completedLessons.reduce((total, lp) => total + lp.score, 0) / completedLessons.length;
  }
  
  this.statistics.perfectScores = this.lessonProgress.filter(lp => lp.score === 100).length;
  this.statistics.wordsLearned = this.vocabularyProgress.filter(vp => vp.isLearned).length;
};

// Static methods
progressSchema.statics.getUserProgress = function(userId, language) {
  return this.findOne({ userId, language })
    .populate('lessonProgress.lessonId', 'title difficulty category')
    .populate('vocabularyProgress.wordId', 'word translation difficulty');
};

module.exports = mongoose.model('Progress', progressSchema);

