const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Stripe Integration
  stripeCustomerId: {
    type: String,
    required: true,
    unique: true
  },
  stripeSubscriptionId: {
    type: String,
    unique: true,
    sparse: true
  },
  stripePriceId: String,
  stripeProductId: String,
  
  // Subscription Details
  plan: {
    type: String,
    enum: ['free', 'premium', 'pro'],
    default: 'free'
  },
  status: {
    type: String,
    enum: [
      'active', 'canceled', 'incomplete', 'incomplete_expired',
      'past_due', 'trialing', 'unpaid', 'paused'
    ],
    default: 'active'
  },
  
  // Billing
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  amount: {
    type: Number, // in cents
    default: 0
  },
  currency: {
    type: String,
    default: 'usd'
  },
  
  // Dates
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  trialStart: Date,
  trialEnd: Date,
  canceledAt: Date,
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  
  // Features & Limits
  features: {
    maxLessonsPerDay: {
      type: Number,
      default: function() {
        switch(this.plan) {
          case 'free': return 3;
          case 'premium': return 20;
          case 'pro': return -1; // unlimited
          default: return 3;
        }
      }
    },
    aiChatLimit: {
      type: Number,
      default: function() {
        switch(this.plan) {
          case 'free': return 10;
          case 'premium': return 100;
          case 'pro': return -1; // unlimited
          default: return 10;
        }
      }
    },
    offlineAccess: {
      type: Boolean,
      default: function() {
        return this.plan !== 'free';
      }
    },
    advancedAnalytics: {
      type: Boolean,
      default: function() {
        return this.plan === 'pro';
      }
    },
    prioritySupport: {
      type: Boolean,
      default: function() {
        return this.plan !== 'free';
      }
    },
    customLearningPath: {
      type: Boolean,
      default: function() {
        return this.plan === 'pro';
      }
    }
  },
  
  // Usage Tracking
  usage: {
    currentPeriod: {
      lessonsCompleted: {
        type: Number,
        default: 0
      },
      aiChatMessages: {
        type: Number,
        default: 0
      },
      lastReset: {
        type: Date,
        default: Date.now
      }
    },
    totalUsage: {
      lessonsCompleted: {
        type: Number,
        default: 0
      },
      aiChatMessages: {
        type: Number,
        default: 0
      },
      totalTimeSpent: {
        type: Number,
        default: 0
      }
    }
  },
  
  // Payment History
  paymentHistory: [{
    stripePaymentIntentId: String,
    amount: Number,
    currency: String,
    status: {
      type: String,
      enum: ['succeeded', 'failed', 'pending', 'canceled']
    },
    paidAt: Date,
    failureReason: String
  }],
  
  // Discounts & Coupons
  discount: {
    couponId: String,
    percentOff: Number,
    amountOff: Number,
    validUntil: Date
  },
  
  // Metadata
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'admin'],
      default: 'web'
    },
    referralCode: String,
    campaignId: String
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
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1, plan: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

// Pre-save middleware
subscriptionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Reset usage if new billing period
  if (this.currentPeriodStart && this.usage.currentPeriod.lastReset < this.currentPeriodStart) {
    this.usage.currentPeriod.lessonsCompleted = 0;
    this.usage.currentPeriod.aiChatMessages = 0;
    this.usage.currentPeriod.lastReset = new Date();
  }
  
  next();
});

// Methods
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' || this.status === 'trialing';
};

subscriptionSchema.methods.hasFeature = function(featureName) {
  return this.features[featureName] === true;
};

subscriptionSchema.methods.canUseFeature = function(featureName, requestedAmount = 1) {
  const limit = this.features[featureName];
  
  // Unlimited access
  if (limit === -1) return true;
  
  // Check current usage
  const currentUsage = this.usage.currentPeriod[featureName] || 0;
  return currentUsage + requestedAmount <= limit;
};

subscriptionSchema.methods.incrementUsage = function(featureName, amount = 1) {
  if (!this.usage.currentPeriod[featureName]) {
    this.usage.currentPeriod[featureName] = 0;
  }
  if (!this.usage.totalUsage[featureName]) {
    this.usage.totalUsage[featureName] = 0;
  }
  
  this.usage.currentPeriod[featureName] += amount;
  this.usage.totalUsage[featureName] += amount;
};

subscriptionSchema.methods.getRemainingUsage = function(featureName) {
  const limit = this.features[featureName];
  if (limit === -1) return -1; // unlimited
  
  const currentUsage = this.usage.currentPeriod[featureName] || 0;
  return Math.max(0, limit - currentUsage);
};

subscriptionSchema.methods.addPayment = function(paymentData) {
  this.paymentHistory.push({
    stripePaymentIntentId: paymentData.id,
    amount: paymentData.amount,
    currency: paymentData.currency,
    status: paymentData.status,
    paidAt: new Date(paymentData.created * 1000),
    failureReason: paymentData.last_payment_error?.message
  });
};

subscriptionSchema.methods.updateFromStripe = function(stripeSubscription) {
  this.status = stripeSubscription.status;
  this.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
  this.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
  this.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
  
  if (stripeSubscription.canceled_at) {
    this.canceledAt = new Date(stripeSubscription.canceled_at * 1000);
  }
  
  if (stripeSubscription.trial_start) {
    this.trialStart = new Date(stripeSubscription.trial_start * 1000);
  }
  
  if (stripeSubscription.trial_end) {
    this.trialEnd = new Date(stripeSubscription.trial_end * 1000);
  }
  
  // Update plan based on price ID
  const priceId = stripeSubscription.items.data[0]?.price?.id;
  if (priceId) {
    this.stripePriceId = priceId;
    // Map price ID to plan (this would be configured based on your Stripe setup)
    this.plan = this.mapPriceIdToPlan(priceId);
  }
};

subscriptionSchema.methods.mapPriceIdToPlan = function(priceId) {
  // This mapping should be configured based on your Stripe price IDs
  const priceMapping = {
    'price_premium_monthly': 'premium',
    'price_premium_yearly': 'premium',
    'price_pro_monthly': 'pro',
    'price_pro_yearly': 'pro'
  };
  
  return priceMapping[priceId] || 'free';
};

subscriptionSchema.methods.isExpired = function() {
  if (!this.currentPeriodEnd) return false;
  return new Date() > this.currentPeriodEnd;
};

subscriptionSchema.methods.daysUntilExpiry = function() {
  if (!this.currentPeriodEnd) return null;
  const now = new Date();
  const diffTime = this.currentPeriodEnd - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Static methods
subscriptionSchema.statics.getActiveSubscriptions = function() {
  return this.find({ 
    status: { $in: ['active', 'trialing'] },
    currentPeriodEnd: { $gte: new Date() }
  });
};

subscriptionSchema.statics.getExpiringSubscriptions = function(days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: 'active',
    cancelAtPeriodEnd: true,
    currentPeriodEnd: { $lte: futureDate, $gte: new Date() }
  }).populate('userId', 'email username');
};

subscriptionSchema.statics.getUsageStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$plan',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$amount' },
        avgLessonsCompleted: { $avg: '$usage.totalUsage.lessonsCompleted' },
        avgChatMessages: { $avg: '$usage.totalUsage.aiChatMessages' }
      }
    }
  ]);
};

module.exports = mongoose.model('Subscription', subscriptionSchema);

