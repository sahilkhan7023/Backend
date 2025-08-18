const mongoose = require('mongoose');

const vocabItemSchema = new mongoose.Schema({
  // Basic Info
  word: {
    type: String,
    required: true,
    trim: true
  },
  translation: {
    type: String,
    required: true,
    trim: true
  },
  language: {
    type: String,
    required: true
  },
  targetLanguage: {
    type: String,
    required: true
  },
  
  // Linguistic Info
  partOfSpeech: {
    type: String,
    enum: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'article'],
    required: true
  },
  phonetic: {
    type: String,
    trim: true
  },
  pronunciation: {
    audioUrl: String,
    phonetic: String
  },
  
  // Difficulty & Category
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  frequency: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  category: {
    type: String,
    enum: [
      'basic', 'family', 'food', 'travel', 'work', 'education', 
      'health', 'sports', 'technology', 'nature', 'emotions', 
      'time', 'colors', 'numbers', 'clothing', 'transportation',
      'animals', 'weather', 'hobbies', 'business', 'culture'
    ],
    default: 'basic'
  },
  
  // Learning Content
  definition: {
    type: String,
    required: true
  },
  examples: [{
    sentence: {
      type: String,
      required: true
    },
    translation: {
      type: String,
      required: true
    },
    audioUrl: String
  }],
  synonyms: [String],
  antonyms: [String],
  relatedWords: [String],
  
  // Media
  imageUrl: String,
  audioUrl: String,
  videoUrl: String,
  
  // Metadata
  tags: [String],
  lessonIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  }],
  
  // Statistics
  statistics: {
    totalLearners: {
      type: Number,
      default: 0
    },
    averageAccuracy: {
      type: Number,
      default: 0
    },
    difficultyRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3
    }
  },
  
  // Admin
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
vocabItemSchema.index({ word: 1, language: 1 });
vocabItemSchema.index({ category: 1, difficulty: 1 });
vocabItemSchema.index({ frequency: -1 });
vocabItemSchema.index({ tags: 1 });

// Pre-save middleware
vocabItemSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Methods
vocabItemSchema.methods.addExample = function(sentence, translation, audioUrl = null) {
  this.examples.push({
    sentence,
    translation,
    audioUrl
  });
};

vocabItemSchema.methods.updateStatistics = function(accuracy) {
  this.statistics.totalLearners += 1;
  this.statistics.averageAccuracy = 
    (this.statistics.averageAccuracy + accuracy) / 2;
};

// Static methods
vocabItemSchema.statics.getByCategory = function(category, difficulty = null, limit = 50) {
  const query = { category, isActive: true };
  if (difficulty) {
    query.difficulty = difficulty;
  }
  
  return this.find(query)
    .sort({ frequency: -1 })
    .limit(limit);
};

vocabItemSchema.statics.getRandomWords = function(count = 10, difficulty = null, excludeIds = []) {
  const pipeline = [
    { $match: { 
      isActive: true,
      _id: { $nin: excludeIds },
      ...(difficulty && { difficulty })
    }},
    { $sample: { size: count } }
  ];
  
  return this.aggregate(pipeline);
};

vocabItemSchema.statics.searchWords = function(searchTerm, language, limit = 20) {
  return this.find({
    language,
    isActive: true,
    $or: [
      { word: { $regex: searchTerm, $options: 'i' } },
      { translation: { $regex: searchTerm, $options: 'i' } },
      { definition: { $regex: searchTerm, $options: 'i' } }
    ]
  })
  .sort({ frequency: -1 })
  .limit(limit);
};

module.exports = mongoose.model('VocabItem', vocabItemSchema);

