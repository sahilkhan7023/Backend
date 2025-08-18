const express = require('express');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All subscription routes require authentication
router.use(authenticateToken);

// Get subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'usd',
        interval: null,
        features: {
          maxLessonsPerDay: 3,
          aiChatLimit: 10,
          offlineAccess: false,
          advancedAnalytics: false,
          prioritySupport: false,
          customLearningPath: false
        },
        description: 'Perfect for getting started with language learning',
        popular: false
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 999, // $9.99 in cents
        currency: 'usd',
        interval: 'month',
        stripePriceId: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_premium_monthly',
        features: {
          maxLessonsPerDay: 20,
          aiChatLimit: 100,
          offlineAccess: true,
          advancedAnalytics: false,
          prioritySupport: true,
          customLearningPath: false
        },
        description: 'Unlock more lessons and AI conversations',
        popular: true
      },
      {
        id: 'premium_yearly',
        name: 'Premium (Yearly)',
        price: 9999, // $99.99 in cents (save 17%)
        currency: 'usd',
        interval: 'year',
        stripePriceId: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || 'price_premium_yearly',
        features: {
          maxLessonsPerDay: 20,
          aiChatLimit: 100,
          offlineAccess: true,
          advancedAnalytics: false,
          prioritySupport: true,
          customLearningPath: false
        },
        description: 'Save 17% with annual billing',
        popular: false,
        savings: '17%'
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 1999, // $19.99 in cents
        currency: 'usd',
        interval: 'month',
        stripePriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
        features: {
          maxLessonsPerDay: -1, // unlimited
          aiChatLimit: -1, // unlimited
          offlineAccess: true,
          advancedAnalytics: true,
          prioritySupport: true,
          customLearningPath: true
        },
        description: 'Everything unlimited with advanced features',
        popular: false
      },
      {
        id: 'pro_yearly',
        name: 'Pro (Yearly)',
        price: 19999, // $199.99 in cents (save 17%)
        currency: 'usd',
        interval: 'year',
        stripePriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
        features: {
          maxLessonsPerDay: -1,
          aiChatLimit: -1,
          offlineAccess: true,
          advancedAnalytics: true,
          prioritySupport: true,
          customLearningPath: true
        },
        description: 'Save 17% with annual billing',
        popular: false,
        savings: '17%'
      }
    ];

    res.json({
      message: 'Subscription plans retrieved successfully',
      plans
    });

  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      message: 'Failed to retrieve subscription plans',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get current subscription
router.get('/current', async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });

    if (!subscription) {
      // Create free subscription if none exists
      const newSubscription = new Subscription({
        userId: req.user._id,
        stripeCustomerId: `temp_${req.user._id}`,
        plan: 'free'
      });
      await newSubscription.save();

      return res.json({
        message: 'Free subscription created',
        subscription: newSubscription
      });
    }

    res.json({
      message: 'Current subscription retrieved successfully',
      subscription
    });

  } catch (error) {
    console.error('Get current subscription error:', error);
    res.status(500).json({
      message: 'Failed to retrieve current subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create Stripe customer and setup intent
router.post('/setup-intent', async (req, res) => {
  try {
    let subscription = await Subscription.findOne({ userId: req.user._id });
    let stripeCustomerId;

    if (!subscription || subscription.stripeCustomerId.startsWith('temp_')) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.username,
        metadata: {
          userId: req.user._id.toString()
        }
      });

      stripeCustomerId = customer.id;

      if (subscription) {
        // Update existing subscription
        subscription.stripeCustomerId = stripeCustomerId;
        await subscription.save();
      } else {
        // Create new subscription
        subscription = new Subscription({
          userId: req.user._id,
          stripeCustomerId,
          plan: 'free'
        });
        await subscription.save();
      }
    } else {
      stripeCustomerId = subscription.stripeCustomerId;
    }

    // Create setup intent for future payments
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session'
    });

    res.json({
      message: 'Setup intent created successfully',
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId
    });

  } catch (error) {
    console.error('Setup intent error:', error);
    res.status(500).json({
      message: 'Failed to create setup intent',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create subscription
router.post('/create', [
  body('priceId').notEmpty().withMessage('Price ID is required'),
  body('paymentMethodId').optional().isString().withMessage('Payment method ID must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { priceId, paymentMethodId } = req.body;

    let subscription = await Subscription.findOne({ userId: req.user._id });
    if (!subscription) {
      return res.status(400).json({
        message: 'Please create a setup intent first'
      });
    }

    // Create Stripe subscription
    const subscriptionData = {
      customer: subscription.stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId: req.user._id.toString()
      }
    };

    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    const stripeSubscription = await stripe.subscriptions.create(subscriptionData);

    // Update our subscription record
    subscription.stripeSubscriptionId = stripeSubscription.id;
    subscription.stripePriceId = priceId;
    subscription.updateFromStripe(stripeSubscription);
    await subscription.save();

    res.json({
      message: 'Subscription created successfully',
      subscription: {
        id: stripeSubscription.id,
        status: stripeSubscription.status,
        clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret
      }
    });

  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({
      message: 'Failed to create subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update subscription
router.put('/update', [
  body('priceId').notEmpty().withMessage('Price ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { priceId } = req.body;

    const subscription = await Subscription.findOne({ userId: req.user._id });
    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({
        message: 'No active subscription found'
      });
    }

    // Get current Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

    // Update the subscription
    const updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: stripeSubscription.items.data[0].id,
        price: priceId
      }],
      proration_behavior: 'create_prorations'
    });

    // Update our subscription record
    subscription.stripePriceId = priceId;
    subscription.updateFromStripe(updatedSubscription);
    await subscription.save();

    res.json({
      message: 'Subscription updated successfully',
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        plan: subscription.plan
      }
    });

  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({
      message: 'Failed to update subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Cancel subscription
router.post('/cancel', [
  body('cancelAtPeriodEnd').optional().isBoolean().withMessage('Cancel at period end must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { cancelAtPeriodEnd = true } = req.body;

    const subscription = await Subscription.findOne({ userId: req.user._id });
    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({
        message: 'No active subscription found'
      });
    }

    let updatedSubscription;
    if (cancelAtPeriodEnd) {
      // Cancel at period end
      updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
    } else {
      // Cancel immediately
      updatedSubscription = await stripe.subscriptions.del(subscription.stripeSubscriptionId);
    }

    // Update our subscription record
    subscription.updateFromStripe(updatedSubscription);
    await subscription.save();

    res.json({
      message: cancelAtPeriodEnd ? 'Subscription will be canceled at period end' : 'Subscription canceled immediately',
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        currentPeriodEnd: subscription.currentPeriodEnd
      }
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      message: 'Failed to cancel subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Reactivate subscription
router.post('/reactivate', async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });
    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({
        message: 'No subscription found'
      });
    }

    // Reactivate subscription
    const updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    // Update our subscription record
    subscription.updateFromStripe(updatedSubscription);
    await subscription.save();

    res.json({
      message: 'Subscription reactivated successfully',
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        cancelAtPeriodEnd: false
      }
    });

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({
      message: 'Failed to reactivate subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get billing history
router.get('/billing-history', async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user._id });
    if (!subscription || !subscription.stripeCustomerId) {
      return res.json({
        message: 'No billing history found',
        invoices: []
      });
    }

    // Get invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 20
    });

    const billingHistory = invoices.data.map(invoice => ({
      id: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      date: new Date(invoice.created * 1000),
      description: invoice.lines.data[0]?.description || 'Subscription',
      invoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf
    }));

    res.json({
      message: 'Billing history retrieved successfully',
      invoices: billingHistory
    });

  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({
      message: 'Failed to retrieve billing history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Helper functions for webhook handlers
async function handleSubscriptionUpdate(stripeSubscription) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSubscription.id
  });

  if (subscription) {
    subscription.updateFromStripe(stripeSubscription);
    await subscription.save();

    // Update user subscription info
    await User.findByIdAndUpdate(subscription.userId, {
      'subscription.type': subscription.plan,
      'subscription.status': subscription.status,
      'subscription.currentPeriodEnd': subscription.currentPeriodEnd
    });
  }
}

async function handleSubscriptionDeleted(stripeSubscription) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSubscription.id
  });

  if (subscription) {
    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    subscription.plan = 'free';
    await subscription.save();

    // Update user subscription info
    await User.findByIdAndUpdate(subscription.userId, {
      'subscription.type': 'free',
      'subscription.status': 'canceled'
    });
  }
}

async function handlePaymentSucceeded(invoice) {
  const subscription = await Subscription.findOne({
    stripeCustomerId: invoice.customer
  });

  if (subscription) {
    subscription.addPayment({
      id: invoice.payment_intent,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      created: invoice.created
    });
    await subscription.save();
  }
}

async function handlePaymentFailed(invoice) {
  const subscription = await Subscription.findOne({
    stripeCustomerId: invoice.customer
  });

  if (subscription) {
    subscription.addPayment({
      id: invoice.payment_intent,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      created: invoice.created,
      last_payment_error: invoice.last_payment_error
    });
    await subscription.save();
  }
}

module.exports = router;

