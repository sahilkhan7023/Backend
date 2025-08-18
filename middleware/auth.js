const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        message: 'Access token required',
        code: 'TOKEN_REQUIRED'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

// Verify admin role
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
    return res.status(403).json({ 
      message: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

// Verify premium subscription
const requirePremium = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const Subscription = require('../models/Subscription');
    const subscription = await Subscription.findOne({ userId: req.user._id });

    if (!subscription || !subscription.isActive() || subscription.plan === 'free') {
      return res.status(403).json({ 
        message: 'Premium subscription required',
        code: 'PREMIUM_REQUIRED',
        upgradeUrl: '/pricing'
      });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Premium check error:', error);
    res.status(500).json({ 
      message: 'Subscription verification error',
      code: 'SUBSCRIPTION_ERROR'
    });
  }
};

// Check feature access
const checkFeatureAccess = (featureName, requiredAmount = 1) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const Subscription = require('../models/Subscription');
      const subscription = await Subscription.findOne({ userId: req.user._id });

      if (!subscription) {
        // Create free subscription if none exists
        const newSubscription = new Subscription({
          userId: req.user._id,
          stripeCustomerId: `temp_${req.user._id}`, // Will be updated when user subscribes
          plan: 'free'
        });
        await newSubscription.save();
        req.subscription = newSubscription;
      } else {
        req.subscription = subscription;
      }

      // Check if user can use the feature
      if (!req.subscription.canUseFeature(featureName, requiredAmount)) {
        const remaining = req.subscription.getRemainingUsage(featureName);
        return res.status(403).json({ 
          message: `Feature limit exceeded. ${remaining} uses remaining.`,
          code: 'FEATURE_LIMIT_EXCEEDED',
          featureName,
          remaining,
          upgradeUrl: '/pricing'
        });
      }

      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      res.status(500).json({ 
        message: 'Feature access verification error',
        code: 'FEATURE_ACCESS_ERROR'
      });
    }
  };
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

// Generate JWT token
const generateToken = (userId, expiresIn = '7d') => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );
};

// Verify refresh token
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requirePremium,
  checkFeatureAccess,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};

