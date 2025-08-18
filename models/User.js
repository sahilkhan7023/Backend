const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Info
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password required if not Google OAuth
    },
    minlength: 6
  },
  
  // OAuth
  googleId: {
    type: String,
    sparse: true
  },
  
  // Profile
  firstName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  avatar: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: 500
  },
  
  // Language Learning
  nativeLanguage: {
    type: String,
    default: 'en'
  },
  targetLanguages: [{
    language: String,
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    startDate: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Progress & Gamification
  totalXP: {
    type: Number,
    default: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastActiveDate: {
    type: Date,
    default: Date.now
  },
  level: {
    type: Number,
    default: 1
  },
  badges: [{
    name: String,
    description: String,
    icon: String,
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Subscription
  subscription: {
    type: {
      type: String,
      enum: ['free', 'premium', 'pro'],
      default: 'free'
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    }
  },
  
  // Settings
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      dailyReminder: {
        type: Boolean,
        default: true
      },
      weeklyReport: {
        type: Boolean,
        default: true
      }
    },
    privacy: {
      showInLeaderboard: {
        type: Boolean,
        default: true
      },
      shareProgress: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Admin
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Timestamps
  lastLogin: Date,
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
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ totalXP: -1 });
userSchema.index({ currentStreak: -1 });
userSchema.index({ 'subscription.type': 1 });

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Update timestamp
  this.updatedAt = new Date();
  
  // Hash password if modified
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateStreak = function() {
  const today = new Date();
  const lastActive = new Date(this.lastActiveDate);
  const daysDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 1) {
    // Consecutive day
    this.currentStreak += 1;
    if (this.currentStreak > this.longestStreak) {
      this.longestStreak = this.currentStreak;
    }
  } else if (daysDiff > 1) {
    // Streak broken
    this.currentStreak = 1;
  }
  // If daysDiff === 0, same day, no change needed
  
  this.lastActiveDate = today;
};

userSchema.methods.addXP = function(points) {
  this.totalXP += points;
  
  // Level up calculation (every 1000 XP = 1 level)
  const newLevel = Math.floor(this.totalXP / 1000) + 1;
  if (newLevel > this.level) {
    this.level = newLevel;
    return { leveledUp: true, newLevel };
  }
  
  return { leveledUp: false, newLevel: this.level };
};

userSchema.methods.addBadge = function(badge) {
  const existingBadge = this.badges.find(b => b.name === badge.name);
  if (!existingBadge) {
    this.badges.push(badge);
    return true;
  }
  return false;
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.emailVerificationToken;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  return user;
};

// Static methods
userSchema.statics.getLeaderboard = function(limit = 50) {
  return this.find({ 
    isActive: true, 
    'preferences.privacy.showInLeaderboard': true 
  })
  .select('username avatar totalXP currentStreak level badges')
  .sort({ totalXP: -1 })
  .limit(limit);
};

module.exports = mongoose.model('User', userSchema);

