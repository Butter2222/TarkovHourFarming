const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');

const router = express.Router();

// Initialize Stripe - make sure to set STRIPE_SECRET_KEY in .env
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Price mapping for Stripe
const STRIPE_PRICES = {
  'basic': process.env.STRIPE_PRICE_BASIC || 'price_basic_monthly',
  'premium': process.env.STRIPE_PRICE_PREMIUM || 'price_premium_monthly'
};

// Create checkout session for subscription
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { planId, planName } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    console.log('💳 Creating checkout session:', { planId, planName, userId, userEmail });

    // Validate plan
    const validPlans = {
      'basic': { price: 12, name: 'Basic' },
      'premium': { price: 20, name: 'Premium' }
    };
    
    if (!validPlans[planId]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    if (!stripe) {
      console.log('⚠️ Stripe not configured, returning demo response');
      return res.json({
        message: 'Demo mode - Stripe integration will be completed with your API keys',
        plan: planName,
        price: validPlans[planId].price,
        checkoutUrl: null
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      line_items: [
        {
          price: STRIPE_PRICES[planId],
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard?tab=subscription&success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard?tab=subscription&canceled=true`,
      metadata: {
        userId: userId.toString(),
        planId: planId,
        planName: planName
      },
      subscription_data: {
        metadata: {
          userId: userId.toString(),
          planId: planId
        }
      }
    });

    console.log('✅ Stripe checkout session created:', session.id);

    // Log the action
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'checkout_initiated', 'subscription', planName, { 
      price: validPlans[planId].price,
      sessionId: session.id
    }, clientIP);
    
    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Handle Stripe webhook for payment confirmations
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.log('⚠️ Stripe webhook not configured');
    return res.json({ received: true });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('📧 Stripe webhook received:', event.type);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
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
    console.error('❌ Webhook processing error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Webhook handlers
async function handleCheckoutCompleted(session) {
  console.log('✅ Checkout completed:', session.id);
  
  const userId = parseInt(session.metadata.userId);
  const planId = session.metadata.planId;
  const planName = session.metadata.planName;

  if (userId && planId) {
    // Update user subscription
    await db.updateUserSubscription(userId, {
      plan: planName,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    });

    // Log the successful payment
    db.logAction(userId, 'subscription_activated', 'subscription', planName, {
      sessionId: session.id,
      customerId: session.customer,
      subscriptionId: session.subscription
    }, 'stripe_webhook');

    console.log(`🎉 User ${userId} subscription activated: ${planName}`);
  }
}

async function handleSubscriptionCreated(subscription) {
  console.log('📝 Subscription created:', subscription.id);
  
  const userId = parseInt(subscription.metadata.userId);
  if (userId) {
    await db.updateUserSubscription(userId, {
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    });
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Subscription updated:', subscription.id);
  
  const userId = parseInt(subscription.metadata.userId);
  if (userId) {
    await db.updateUserSubscription(userId, {
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    });
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Subscription deleted:', subscription.id);
  
  const userId = parseInt(subscription.metadata.userId);
  if (userId) {
    await db.updateUserSubscription(userId, {
      status: 'canceled',
      expiresAt: new Date(subscription.current_period_end * 1000)
    });

    db.logAction(userId, 'subscription_canceled', 'subscription', 'canceled', {
      subscriptionId: subscription.id,
      canceledAt: new Date()
    }, 'stripe_webhook');
  }
}

async function handlePaymentSucceeded(invoice) {
  console.log('💰 Payment succeeded:', invoice.id);
  
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = parseInt(subscription.metadata.userId);
    
    if (userId) {
      await db.updateUserSubscription(userId, {
        status: 'active',
        expiresAt: new Date(subscription.current_period_end * 1000)
      });

      db.logAction(userId, 'payment_succeeded', 'payment', invoice.amount_paid / 100, {
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription
      }, 'stripe_webhook');
    }
  }
}

async function handlePaymentFailed(invoice) {
  console.log('💸 Payment failed:', invoice.id);
  
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = parseInt(subscription.metadata.userId);
    
    if (userId) {
      db.logAction(userId, 'payment_failed', 'payment', invoice.amount_due / 100, {
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription,
        reason: invoice.last_finalization_error?.message || 'Unknown'
      }, 'stripe_webhook');
    }
  }
}

// Get user's subscription status
router.get('/subscription-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    let subscriptionData = user.subscription || { plan: 'none', expiresAt: null };
    
    // If user has a Stripe subscription, get latest data
    if (stripe && subscriptionData.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionData.stripeSubscriptionId);
        subscriptionData = {
          ...subscriptionData,
          status: stripeSubscription.status,
          expiresAt: new Date(stripeSubscription.current_period_end * 1000)
        };
      } catch (error) {
        console.error('Error fetching Stripe subscription:', error);
      }
    }

    const isActive = subscriptionData && subscriptionData.expiresAt && new Date(subscriptionData.expiresAt) > new Date();
    
    res.json({
      subscription: subscriptionData,
      active: isActive
    });
    
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);
    
    if (!user || !user.subscription || !user.subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (!stripe) {
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Cancel the Stripe subscription at period end
    const subscription = await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Update local database
    await db.updateUserSubscription(userId, {
      status: 'cancel_at_period_end',
      canceledAt: new Date(),
      expiresAt: new Date(subscription.current_period_end * 1000)
    });

    // Log the cancellation
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'subscription_cancel_requested', 'subscription', 'cancel_at_period_end', {
      subscriptionId: subscription.id,
      willEndAt: new Date(subscription.current_period_end * 1000)
    }, clientIP);

    res.json({
      message: 'Subscription will be canceled at the end of the billing period',
      endsAt: new Date(subscription.current_period_end * 1000)
    });

  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Reactivate subscription (undo cancellation)
router.post('/reactivate-subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);
    
    if (!user || !user.subscription || !user.subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    if (!stripe) {
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Check if subscription is cancelled but still active
    const stripeSubscription = await stripe.subscriptions.retrieve(user.subscription.stripeSubscriptionId);
    
    if (!stripeSubscription.cancel_at_period_end) {
      return res.status(400).json({ error: 'Subscription is not scheduled for cancellation' });
    }

    // Reactivate the subscription
    const subscription = await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    // Update local database
    await db.updateUserSubscription(userId, {
      status: 'active',
      canceledAt: null,
      expiresAt: new Date(subscription.current_period_end * 1000)
    });

    // Log the reactivation
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'subscription_reactivated', 'subscription', 'active', {
      subscriptionId: subscription.id,
      renewsAt: new Date(subscription.current_period_end * 1000)
    }, clientIP);

    res.json({
      message: 'Subscription reactivated successfully',
      renewsAt: new Date(subscription.current_period_end * 1000)
    });

  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

module.exports = router; 