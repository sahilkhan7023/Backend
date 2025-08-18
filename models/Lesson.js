const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
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
  
  // Structure
  category: {
    type: String,
    enum: [
      'grammar', 'vocabulary', 'conversation', 'pronunciation', 
      'listening', 'reading', 'writing', 'culture', 'business'
    ],
    required: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  level: {
    type: Number,
    min: 1,
    max: 100,
    required: true
  },
  
  // Content
  content: {
    introduction: {
      text: String,
      audioUrl: String,
      videoUrl: String
    },
    sections: [{
      title: String,
      type: {
        type: String,
        enum: ['text', 'audio', 'video', 'interactive', 'quiz', 'flashcards']
      },
      content: mongoose.Schema.Types.Mixed,
      order: Number
    }],
    summary: {
      text: String,
      keyPoints: [String]
    }
  },
  
  // Learning Objectives
  objectives: [String],
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  }],
  
  // Vocabulary
  vocabularyItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VocabItem'
  }],
  newWords: [{
    word: String,
    translation: String,
    definition: String,
    examples: [String]
  }],
  
  // Exercises
  exercises: [{
    type: {
      type: String,
      enum: ['multiple_choice', 'fill_blank', 'matching', 'ordering', 'speaking', 'listening', 'translation']
    },
    question: String,
    options: [String],
    correctAnswer: mongoose.Schema.Types.Mixed,
    explanation: String,
    points: {
      type: Number,
      default: 10
    },
    audioUrl: String,
    imageUrl: String
  }],
  
  // Gamification
  xpReward: {
    type: Number,
    default: 100
  },
  badges: [{
    name: String,
    description: String,
    icon: String,
    condition: String // e.g., "complete_with_90_percent"
  }],
  
  // Media
  thumbnailUrl: String,
  audioFiles: [String],
  videoFiles: [String],
  imageFiles: [String],
  
  // Settings
  estimatedDuration: {
    type: Number, // in minutes
    default: 15
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  isFree: {
    type: Boolean,
    default: true
  },
  
  // Statistics
  statistics: {
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
    difficultyRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    },
    popularityScore: {
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
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Metadata
  tags: [String],
  version: {
    type: Number,
    default: 1
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
lessonSchema.index({ language: 1, difficulty: 1, level: 1 });
lessonSchema.index({ category: 1, isPublished: 1 });
lessonSchema.index({ 'statistics.popularityScore': -1 });
lessonSchema.index({ tags: 1 });

// Pre-save middleware
lessonSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Sort sections by order
  if (this.content && this.content.sections) {
    this.content.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  
  next();
});

// Methods
lessonSchema.methods.addExercise = function(exercise) {
  this.exercises.push(exercise);
  return this.exercises.length - 1; // Return index
};

lessonSchema.methods.updateStatistics = function(score, timeSpent) {
  this.statistics.totalCompletions += 1;
  
  // Update average score
  const totalScore = this.statistics.averageScore * (this.statistics.totalCompletions - 1) + score;
  this.statistics.averageScore = totalScore / this.statistics.totalCompletions;
  
  // Update average time
  const totalTime = this.statistics.averageTime * (this.statistics.totalCompletions - 1) + timeSpent;
  this.statistics.averageTime = totalTime / this.statistics.totalCompletions;
  
  // Update popularity score (based on completions and average score)
  this.statistics.popularityScore = this.statistics.totalCompletions * (this.statistics.averageScore / 100);
};

lessonSchema.methods.canUserAccess = function(user) {
  // Check if lesson is free or user has premium subscription
  if (this.isFree) return true;
  if (user.subscription && user.subscription.type !== 'free') return true;
  return false;
};

lessonSchema.methods.checkPrerequisites = function(userProgress) {
  if (!this.prerequisites || this.prerequisites.length === 0) return true;
  
  return this.prerequisites.every(prereqId => {
    const lessonProgress = userProgress.lessonProgress.find(
      lp => lp.lessonId.toString() === prereqId.toString()
    );
    return lessonProgress && (lessonProgress.status === 'completed' || lessonProgress.status === 'mastered');
  });
};

// Static methods
lessonSchema.statics.getByDifficulty = function(language, difficulty, limit = 20) {
  return this.find({ 
    language, 
    difficulty, 
    isPublished: true 
  })
  .sort({ level: 1 })
  .limit(limit)
  .populate('vocabularyItems', 'word translation')
  .populate('prerequisites', 'title level');
};

lessonSchema.statics.getPopular = function(language, limit = 10) {
  return this.find({ 
    language, 
    isPublished: true 
  })
  .sort({ 'statistics.popularityScore': -1 })
  .limit(limit)
  .select('title description difficulty level thumbnailUrl statistics');
};

lessonSchema.statics.searchLessons = function(searchTerm, language, filters = {}) {
  const query = {
    language,
    isPublished: true,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ]
  };
  
  // Apply filters
  if (filters.difficulty) query.difficulty = filters.difficulty;
  if (filters.category) query.category = filters.category;
  if (filters.level) {
    query.level = { 
      $gte: filters.level.min || 1, 
      $lte: filters.level.max || 100 
    };
  }
  
  return this.find(query)
    .sort({ 'statistics.popularityScore': -1 })
    .limit(filters.limit || 20);
};

lessonSchema.statics.getRecommendations = function(userProgress, language, limit = 5) {
  // Get user's completed lessons
  const completedLessonIds = userProgress.lessonProgress
    .filter(lp => lp.status === 'completed' || lp.status === 'mastered')
    .map(lp => lp.lessonId);
  
  // Get user's current level (average of completed lessons)
  const userLevel = userProgress.lessonProgress.length > 0 
    ? Math.ceil(userProgress.lessonProgress.reduce((sum, lp) => sum + (lp.score || 0), 0) / userProgress.lessonProgress.length / 10)
    : 1;
  
  return this.find({
    language,
    isPublished: true,
    _id: { $nin: completedLessonIds },
    level: { $gte: userLevel, $lte: userLevel + 2 }
  })
  .sort({ 'statistics.popularityScore': -1, level: 1 })
  .limit(limit);
};

module.exports = mongoose.model('Lesson', lessonSchema);

