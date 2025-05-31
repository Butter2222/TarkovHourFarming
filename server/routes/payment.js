const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');
const subscriptionManager = require('../services/subscriptionManager');
const vmProvisioning = require('../services/vmProvisioning');

const router = express.Router();

// Initialize Stripe - make sure to set STRIPE_SECRET_KEY in .env
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Price mapping for Stripe - Updated for new plan structure
const STRIPE_PRICES = {
  // Hour Booster Plans
  'hour_booster_1': process.env.HOUR_PRICE_1VM,
  'hour_booster_2': process.env.HOUR_PRICE_2VM,
  'hour_booster_5': process.env.HOUR_PRICE_5VM,
  
  // KD Drop Plans
  'kd_drop_1': process.env.KDDROP_PRICE_1VM,
  'kd_drop_2': process.env.KDDROP_PRICE_2VM,
  'kd_drop_5': process.env.KDDROP_PRICE_5VM,
  
  // Dual Mode Plans
  'dual_mode_1': process.env.DUAL_PRICE_1VM,
  'dual_mode_2': process.env.DUAL_PRICE_2VM,
  'dual_mode_5': process.env.DUAL_PRICE_5VM
};

// Pricing matrix for validation and custom pricing
const PRICING_MATRIX = {
  hour_booster: {
    1: { price: 12, perVM: 12 },
    2: { price: 20, perVM: 10 },
    5: { price: 45, perVM: 9 },
    10: { price: 80, perVM: 8 },
    20: { price: 140, perVM: 7 }
  },
  kd_drop: {
    1: { price: 16, perVM: 16 },
    2: { price: 28, perVM: 14 },
    5: { price: 65, perVM: 13 },
    10: { price: 120, perVM: 12 },
    20: { price: 220, perVM: 11 }
  },
  dual_mode: {
    1: { price: 18, perVM: 18 },
    2: { price: 32, perVM: 16 },
    5: { price: 70, perVM: 14 },
    10: { price: 130, perVM: 13 },
    20: { price: 240, perVM: 12 }
  }
};

// Helper function to calculate custom pricing
function calculateCustomPricing(planType, vmCount) {
  const planPricing = PRICING_MATRIX[planType];
  if (!planPricing) return null;
  
  let perVMPrice;
  if (vmCount === 1) {
    perVMPrice = planPricing[1].perVM;
  } else if (vmCount === 2) {
    perVMPrice = planPricing[2].perVM;
  } else if (vmCount >= 3 && vmCount <= 4) {
    // Interpolate between 2 and 5 VM pricing
    const price2 = planPricing[2].perVM;
    const price5 = planPricing[5].perVM;
    perVMPrice = price2 - ((price2 - price5) * (vmCount - 2) / 3);
  } else if (vmCount === 5) {
    perVMPrice = planPricing[5].perVM;
  } else if (vmCount >= 6 && vmCount <= 9) {
    // Interpolate between 5 and 10 VM pricing
    const price5 = planPricing[5].perVM;
    const price20 = planPricing[20].perVM;
    const estimated10Price = price5 - ((price5 - price20) * 0.6);
    perVMPrice = price5 - ((price5 - estimated10Price) * (vmCount - 5) / 5);
  } else {
    // Use estimated 10+ pricing
    const price5 = planPricing[5].perVM;
    const price20 = planPricing[20].perVM;
    perVMPrice = price5 - ((price5 - price20) * 0.6);
  }
  
  return {
    price: Math.round(perVMPrice * vmCount),
    perVM: Math.round(perVMPrice)
  };
}

// Enhanced checkout session creation that handles upgrades
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { planType, vmCount, planName } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    console.log('Creating checkout session:', { planType, vmCount, planName, userId, userEmail });

    // Validate plan type
    if (!PRICING_MATRIX[planType]) {
      return res.status(400).json({ error: 'Invalid plan type selected' });
    }

    // Validate VM count
    if (!vmCount || vmCount < 1 || vmCount > 10) {
      return res.status(400).json({ error: 'Invalid VM count. Must be between 1-10' });
    }

    // Check if user has existing subscription
    const user = await db.findUserById(userId);
    if (user?.subscription?.stripeSubscriptionId && user.subscription.status === 'active') {
      // User has active subscription - redirect to upgrade endpoint
      return res.status(409).json({ 
        error: 'You already have an active subscription. Please use the upgrade option instead.',
        hasActiveSubscription: true,
        currentPlan: user.subscription.plan
      });
    }

    if (!stripe) {
      console.log('Stripe not configured, returning demo response');
      const pricing = calculateCustomPricing(planType, vmCount);
      return res.json({
        message: 'Demo mode - Stripe integration will be completed with your API keys',
        plan: planName,
        price: pricing?.price,
        checkoutUrl: null
      });
    }

    let priceId;
    let sessionMetadata = {
      userId: userId.toString(),
      planType: planType,
      vmCount: vmCount.toString(),
      planName: planName
    };

    // Check if we have a fixed price for this combination
    const fixedPriceKey = `${planType}_${vmCount}`;
    if (STRIPE_PRICES[fixedPriceKey]) {
      priceId = STRIPE_PRICES[fixedPriceKey];
      console.log(`Using fixed price: ${fixedPriceKey} -> ${priceId}`);
    } else {
      // Create dynamic price for custom VM counts
      const pricing = calculateCustomPricing(planType, vmCount);
      if (!pricing) {
        return res.status(400).json({ error: 'Unable to calculate pricing for this configuration' });
      }

      console.log(`Creating dynamic price for ${vmCount} VMs: $${pricing.price}`);
      
      const dynamicPrice = await stripe.prices.create({
        currency: 'usd',
        unit_amount: pricing.price * 100, // Convert to cents
        recurring: { interval: 'month' },
        product_data: {
          name: `${planName} - ${vmCount} VM${vmCount > 1 ? 's' : ''}`
        },
        metadata: {
          planType: planType,
          vmCount: vmCount.toString(),
          perVMPrice: pricing.perVM.toString()
        }
      });
      
      priceId = dynamicPrice.id;
      console.log(`Dynamic price created: ${priceId}`);
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/dashboard?tab=subscription&success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/dashboard?tab=subscription&canceled=true`,
      metadata: sessionMetadata,
      subscription_data: {
        metadata: sessionMetadata
      }
    });

    console.log('Stripe checkout session created:', session.id);

    // Log the action
    const clientIP = req.ip || req.connection.remoteAddress;
    const pricing = calculateCustomPricing(planType, vmCount);
    db.logAction(userId, 'checkout_initiated', 'subscription', planName, { 
      price: pricing?.price,
      vmCount,
      planType,
      sessionId: session.id
    }, clientIP);
    
    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// New endpoint for subscription upgrades/modifications
router.post('/upgrade-subscription', authenticateToken, async (req, res) => {
  try {
    const { planType, vmCount, planName } = req.body;
    const userId = req.user.id;
    
    console.log('Processing subscription upgrade:', { planType, vmCount, planName, userId });

    // Validate plan type
    if (!PRICING_MATRIX[planType]) {
      return res.status(400).json({ error: 'Invalid plan type selected' });
    }

    // Validate VM count
    if (!vmCount || vmCount < 1 || vmCount > 10) {
      return res.status(400).json({ error: 'Invalid VM count. Must be between 1-10' });
    }

    if (!stripe) {
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Get user's current subscription
    const user = await db.findUserById(userId);
    if (!user?.subscription?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found to upgrade' });
    }

    // Get current subscription from Stripe
    const currentSubscription = await stripe.subscriptions.retrieve(user.subscription.stripeSubscriptionId);
    
    if (currentSubscription.status !== 'active') {
      return res.status(400).json({ error: 'Cannot upgrade inactive subscription' });
    }

    // Calculate new pricing
    const newPricing = calculateCustomPricing(planType, vmCount);
    if (!newPricing) {
      return res.status(400).json({ error: 'Unable to calculate pricing for this configuration' });
    }

    // Check if we have a fixed price for this combination or create dynamic one
    let newPriceId;
    const fixedPriceKey = `${planType}_${vmCount}`;
    
    if (STRIPE_PRICES[fixedPriceKey]) {
      newPriceId = STRIPE_PRICES[fixedPriceKey];
      console.log(`Using fixed price for upgrade: ${fixedPriceKey} -> ${newPriceId}`);
    } else {
      // Create dynamic price for custom VM counts
      console.log(`Creating dynamic price for upgrade: ${vmCount} VMs: $${newPricing.price}`);
      
      const dynamicPrice = await stripe.prices.create({
        currency: 'usd',
        unit_amount: newPricing.price * 100,
        recurring: { interval: 'month' },
        product_data: {
          name: `${planName} - ${vmCount} VM${vmCount > 1 ? 's' : ''}`
        },
        metadata: {
          planType: planType,
          vmCount: vmCount.toString(),
          perVMPrice: newPricing.perVM.toString()
        }
      });
      
      newPriceId = dynamicPrice.id;
      console.log(`Dynamic price created for upgrade: ${newPriceId}`);
    }

    // Update the subscription with proration
    const updatedSubscription = await stripe.subscriptions.update(currentSubscription.id, {
      items: [{
        id: currentSubscription.items.data[0].id,
        price: newPriceId
      }],
      proration_behavior: 'always_invoice',
      metadata: {
        userId: userId.toString(),
        planType: planType,
        vmCount: vmCount.toString(),
        planName: planName,
        upgraded: 'true',
        upgradeDate: new Date().toISOString()
      }
    });

    console.log('Subscription upgraded successfully:', updatedSubscription.id);

    // Force immediate billing by creating and paying the invoice
    let chargedAmount = 0;
    try {
      console.log('Creating immediate invoice for proration...');
      
      // Create an invoice for the proration
      const invoice = await stripe.invoices.create({
        customer: currentSubscription.customer,
        subscription: updatedSubscription.id,
        auto_advance: true, // Automatically attempt payment
        description: `Subscription upgrade: ${planName} - ${vmCount} VM${vmCount > 1 ? 's' : ''}`,
        metadata: {
          upgradeInvoice: 'true',
          userId: userId.toString(),
          oldPlan: user.subscription.plan,
          newPlan: planName
        }
      });

      console.log('Invoice created:', invoice.id);

      // Finalize and pay the invoice immediately
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      console.log('Invoice finalized:', finalizedInvoice.id);

      // Attempt to pay the invoice immediately
      const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id);
      console.log('Invoice payment attempted:', paidInvoice.id, 'Status:', paidInvoice.status);

      // Calculate actual charged amount
      chargedAmount = paidInvoice.amount_paid / 100;
      
      console.log(`Immediate charge processed: $${chargedAmount} for upgrade`);

    } catch (invoiceError) {
      console.error('Error with immediate invoice:', invoiceError);
      // Don't fail the entire upgrade if invoice fails - the subscription update was successful
      console.log('Subscription upgrade completed, but immediate billing may be delayed');
    }

    // Update our database
    await db.updateUserSubscription(userId, {
      plan: planName,
      status: updatedSubscription.status,
      expiresAt: new Date(updatedSubscription.current_period_end * 1000),
      planType: planType,
      vmCount: vmCount
    });

    // Calculate proration details for response
    const currentPeriodStart = new Date(currentSubscription.current_period_start * 1000);
    const currentPeriodEnd = new Date(currentSubscription.current_period_end * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Log the upgrade
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'subscription_upgraded', 'subscription', planName, {
      oldPlan: user.subscription.plan,
      newPlan: planName,
      newPrice: newPricing.price,
      vmCount: vmCount,
      planType: planType,
      subscriptionId: updatedSubscription.id,
      daysRemaining: daysRemaining,
      immediateCharge: chargedAmount || 'pending'
    }, clientIP);

    res.json({
      message: 'Subscription upgraded successfully',
      subscription: {
        id: updatedSubscription.id,
        plan: planName,
        status: updatedSubscription.status,
        expiresAt: new Date(updatedSubscription.current_period_end * 1000),
        price: newPricing.price,
        vmCount: vmCount
      },
      billing: {
        immediateCharge: chargedAmount || 0,
        chargedNow: !!chargedAmount,
        daysRemaining: daysRemaining,
        nextBillingDate: new Date(updatedSubscription.current_period_end * 1000),
        message: chargedAmount 
          ? `You've been charged $${chargedAmount.toFixed(2)} immediately for the upgrade. Your next bill on ${new Date(updatedSubscription.current_period_end * 1000).toLocaleDateString()} will be $${newPricing.price}.`
          : `Your upgrade is active immediately. Billing will be processed shortly for the remaining ${daysRemaining} days of your cycle.`
      }
    });

  } catch (error) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

// Enhanced payment verification that also records payment in database
router.post('/verify-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;
    
    console.log('Verifying checkout session:', sessionId, 'for user:', userId);
    
    if (!sessionId) {
      console.log('No session ID provided');
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (!stripe) {
      console.log('Stripe not configured');
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    console.log('Session details:', {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      mode: session.mode,
      customer: session.customer,
      subscription: session.subscription,
      metadata: session.metadata
    });

    // Verify this session belongs to the current user
    if (parseInt(session.metadata.userId) !== userId) {
      console.log('Session does not belong to current user. Session userId:', session.metadata.userId, 'Current userId:', userId);
      return res.status(403).json({ error: 'Session does not belong to current user' });
    }

    // Check if payment was successful
    if (session.payment_status === 'paid' && session.status === 'complete') {
      console.log('Payment confirmed as successful');
      
      // Get subscription details if it's a subscription
      let subscriptionData = null;
      let planName = session.metadata.planName || 'Unknown';
      let amount = session.amount_total || 0;

      if (session.subscription) {
        console.log('Retrieving subscription details:', session.subscription);
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        subscriptionData = {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer,
          status: subscription.status,
          expiresAt: new Date(subscription.current_period_end * 1000)
        };
        console.log('Subscription data:', subscriptionData);
      }

      // Record the successful payment in our database
      await db.recordPayment({
        userId,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: session.payment_intent,
        stripeSubscriptionId: session.subscription,
        stripeCustomerId: session.customer,
        amount,
        currency: session.currency || 'usd',
        status: 'succeeded',
        paymentMethod: 'checkout_session',
        planId: session.metadata.planId,
        planName,
        metadata: {
          sessionId,
          verificationMethod: 'client_verification'
        }
      });

      // Update user subscription in database
      console.log('Updating user subscription in database...');
      
      const updateResult = await db.updateUserSubscription(userId, {
        plan: planName,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        status: 'active',
        expiresAt: subscriptionData?.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days fallback
      });
      
      console.log('Database update result:', updateResult);

      // Log the successful verification
      const clientIP = req.ip || req.connection.remoteAddress;
      db.logAction(userId, 'subscription_verified', 'subscription', planName, {
        sessionId: session.id,
        method: 'client_verification',
        customerId: session.customer,
        subscriptionId: session.subscription,
        amount
      }, clientIP, userId);

      console.log(`Subscription verified and activated for user ${userId}: ${planName}`);

      res.json({
        success: true,
        message: 'Subscription activated successfully',
        subscription: {
          plan: planName,
          status: 'active',
          expiresAt: subscriptionData?.expiresAt
        },
        payment: {
          amount: `$${(amount / 100).toFixed(2)}`,
          currency: session.currency || 'usd',
          sessionId
        }
      });

    } else {
      console.log('Payment not completed. Status:', session.status, 'Payment status:', session.payment_status);
      res.status(400).json({ 
        error: 'Payment not completed',
        session_status: session.status,
        payment_status: session.payment_status 
      });
    }

  } catch (error) {
    console.error('Error verifying checkout session:', error);
    res.status(500).json({ error: 'Failed to verify checkout session' });
  }
});

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

    // Immediately shutdown VMs since subscription is now cancelled
    console.log(`Immediately shutting down VMs for user ${userId} due to subscription cancellation`);
    await subscriptionManager.shutdownVMsForInactiveSubscription(userId);

    res.json({
      message: 'Subscription will be canceled at the end of the billing period. VMs have been shut down immediately.',
      endsAt: new Date(subscription.current_period_end * 1000),
      vmsShutdown: true
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

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('Webhook received:', {
    hasSignature: !!sig,
    hasSecret: !!endpointSecret,
    bodyLength: req.body?.length
  });

  if (!stripe || !endpointSecret) {
    console.log('Stripe webhook not configured');
    return res.status(400).send('Webhook not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log(`Webhook received: ${event.type} (${event.id})`);
  } catch (err) {
    console.error(`Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Check if we've already processed this event
    const existingWebhook = await db.statements.getWebhookByEventId.get(event.id);
    if (existingWebhook && existingWebhook.processed) {
      console.log(`Webhook ${event.id} already processed, skipping`);
      return res.json({ received: true, processed: false, reason: 'already_processed' });
    }

    // Record the webhook event
    await db.recordWebhook({
      stripeEventId: event.id,
      eventType: event.type,
      objectId: event.data.object.id,
      rawData: event
    });

    // Process the event
    let processed = false;
    let userId = null;

    console.log(`Processing webhook event: ${event.type}`, {
      objectId: event.data.object.id,
      customerId: event.data.object.customer || 'unknown'
    });

    switch (event.type) {
      case 'payment_intent.succeeded':
        userId = await handlePaymentIntentSucceeded(event.data.object);
        processed = true;
        break;

      case 'payment_intent.payment_failed':
        userId = await handlePaymentIntentFailed(event.data.object);
        processed = true;
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        console.log(`Handling subscription event: ${event.type}`);
        userId = await handleSubscriptionUpdated(event.data.object);
        processed = true;
        break;

      case 'customer.subscription.deleted':
        userId = await handleSubscriptionDeleted(event.data.object);
        processed = true;
        break;

      case 'invoice.payment_succeeded':
        userId = await handleInvoicePaymentSucceeded(event.data.object);
        processed = true;
        break;

      case 'invoice.payment_failed':
        userId = await handleInvoicePaymentFailed(event.data.object);
        processed = true;
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object);
        processed = true;
        break;

      case 'refund.created':
        await handleRefundCreated(event.data.object);
        processed = true;
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
        processed = true; // Mark as processed even if we don't handle it
        break;
    }

    // Mark webhook as processed
    if (processed) {
      await db.markWebhookProcessed(event.id);
      console.log(`Webhook ${event.id} processed successfully`);
    }

    res.json({ received: true, processed });

  } catch (error) {
    console.error(`Error processing webhook ${event.id}:`, error);
    await db.markWebhookProcessed(event.id, error);
    res.status(500).json({ error: 'Webhook processing failed', eventId: event.id });
  }
});

// Webhook handler functions
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log(`Payment succeeded: ${paymentIntent.id} - $${paymentIntent.amount / 100}`);
  
  // Check if we already recorded this payment
  const existingPayment = await db.statements.getPaymentByStripeId.get(paymentIntent.id);
  if (existingPayment) {
    console.log(`Payment ${paymentIntent.id} already recorded, updating status`);
    await db.updatePaymentStatus(existingPayment.id, 'succeeded', 
      paymentIntent.payment_method_types?.[0] || 'unknown',
      paymentIntent.metadata
    );
    return existingPayment.user_id;
  }
  
  // Find user by customer ID
  const userId = await findUserByStripeCustomer(paymentIntent.customer);
  if (userId) {
    await db.recordPayment({
      userId,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'succeeded',
      paymentMethod: paymentIntent.payment_method_types?.[0] || 'unknown',
      metadata: paymentIntent.metadata
    });

    // Log the successful payment
    db.logAction(userId, 'payment_succeeded', 'payment', paymentIntent.id, {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    }, 'webhook');
  }
  
  return userId;
}

async function handlePaymentIntentFailed(paymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id} - ${paymentIntent.last_payment_error?.message}`);
  
  // Check if we already recorded this payment
  const existingPayment = await db.statements.getPaymentByStripeId.get(paymentIntent.id);
  if (existingPayment) {
    console.log(`Payment ${paymentIntent.id} already recorded, updating status`);
    await db.updatePaymentStatus(existingPayment.id, 'failed', 
      paymentIntent.payment_method_types?.[0] || 'unknown',
      { 
        ...paymentIntent.metadata,
        failureReason: paymentIntent.last_payment_error?.message
      }
    );
    return existingPayment.user_id;
  }
  
  const userId = await findUserByStripeCustomer(paymentIntent.customer);
  if (userId) {
    await db.recordPayment({
      userId,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'failed',
      paymentMethod: paymentIntent.payment_method_types?.[0] || 'unknown',
      metadata: { 
        ...paymentIntent.metadata,
        failureReason: paymentIntent.last_payment_error?.message
      }
    });

    await db.recordPaymentAttempt({
      userId,
      stripePaymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'failed',
      failureCode: paymentIntent.last_payment_error?.code,
      failureMessage: paymentIntent.last_payment_error?.message,
      lastPaymentError: paymentIntent.last_payment_error
    });

    // Log the failed payment
    db.logAction(userId, 'payment_failed', 'payment', paymentIntent.id, {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      error: paymentIntent.last_payment_error?.message
    }, 'webhook');
  }

  return userId;
}

async function handleSubscriptionUpdated(subscription) {
  console.log(`Subscription updated: ${subscription.id} - Status: ${subscription.status}`);
  console.log(`Subscription details:`, {
    customerId: subscription.customer,
    status: subscription.status,
    metadata: subscription.metadata,
    priceId: subscription.items?.data?.[0]?.price?.id
  });
  
  const userId = await findUserByStripeCustomer(subscription.customer, subscription.metadata);
  console.log(`Found user ID: ${userId} for customer: ${subscription.customer}`);
  
  if (userId) {
    // Extract plan information from subscription metadata or price
    let planName = 'Unknown Plan';
    let planType = '';
    let vmCount = 1;
    
    // Try to get from subscription metadata first
    if (subscription.metadata?.planType && subscription.metadata?.vmCount) {
      planType = subscription.metadata.planType;
      vmCount = parseInt(subscription.metadata.vmCount);
      // Use clean plan name without VM count
      planName = subscription.metadata.planName || planType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      console.log(`Plan from metadata: ${planType}, VMs: ${vmCount}, Name: ${planName}`);
    } else {
      // Fallback: try to determine from price metadata
      const priceData = subscription.items?.data?.[0]?.price;
      if (priceData?.metadata) {
        planType = priceData.metadata.planType || '';
        vmCount = parseInt(priceData.metadata.vmCount) || 1;
        // Clean the plan name from product name
        let productName = priceData.product?.name || subscription.items?.data?.[0]?.price?.nickname || planName;
        // Remove VM count from product name if it exists
        planName = productName.replace(/ - \d+\s*VM[s]?/i, '');
        console.log(`Plan from price metadata: ${planType}, VMs: ${vmCount}, Name: ${planName}`);
      } else {
        // Final fallback: check against known price IDs
        const priceId = subscription.items?.data?.[0]?.price?.id;
        console.log(`Checking price ID: ${priceId} against known prices`);
        for (const [key, value] of Object.entries(STRIPE_PRICES)) {
          if (value === priceId) {
            const [type, count] = key.split('_');
            planType = key.replace(`_${count}`, '');
            vmCount = parseInt(count);
            planName = planType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            console.log(`Plan from price ID match: ${planType}, VMs: ${vmCount}, Name: ${planName}`);
            break;
          }
        }
      }
    }

    await db.updateUserSubscription(userId, {
      plan: planName,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      expiresAt: new Date(subscription.current_period_end * 1000)
    });

    // Log subscription update
    db.logAction(userId, 'subscription_updated', 'subscription', subscription.id, {
      status: subscription.status,
      plan: planName,
      planType: planType,
      vmCount: vmCount,
      expiresAt: new Date(subscription.current_period_end * 1000)
    }, 'webhook');

    // Handle subscription status changes
    if (['active', 'trialing'].includes(subscription.status)) {
      // Check if this is a new subscription that needs VM provisioning
      const userVMs = db.getUserVMIds(userId);
      console.log(`User ${userId} currently has ${userVMs.length} VMs:`, userVMs);
      
      if (userVMs.length === 0) {
        console.log(`New active subscription detected for user ${userId}, provisioning VMs...`);
        console.log(`Provisioning details:`, { planType, vmCount, planName });
        
        try {
          // Trigger VM provisioning asynchronously
          const provisioningResult = await vmProvisioning.provisionVMsForUser(userId, {
            id: subscription.id,
            metadata: subscription.metadata,
            planType: planType,
            vmCount: vmCount,
            planName: planName,
            nickname: planName
          });
          
          console.log(`VM provisioning completed for user ${userId}:`, provisioningResult);
          
          // Log successful provisioning
          db.logAction(userId, 'vm_provisioning_completed', 'subscription', subscription.id, {
            vmsCreated: provisioningResult.vmsCreated?.length || 0,
            planType: planType,
            vmCount: vmCount
          }, 'webhook');
          
        } catch (provisioningError) {
          console.error(`VM provisioning failed for user ${userId}:`, provisioningError);
          
          // Log provisioning failure
          db.logAction(userId, 'vm_provisioning_failed', 'subscription', subscription.id, {
            error: provisioningError.message,
            planType: planType,
            vmCount: vmCount
          }, 'webhook');
        }
      } else {
        console.log(`User ${userId} already has ${userVMs.length} VMs, skipping provisioning`);
      }
    } else {
      // If subscription became inactive, shutdown VMs
      console.log(`Subscription ${subscription.id} is ${subscription.status}, shutting down VMs`);
      await subscriptionManager.shutdownVMsForInactiveSubscription(userId);
    }
  } else {
    console.log(`Could not find user for customer: ${subscription.customer}`);
  }

  return userId;
}

async function handleSubscriptionDeleted(subscription) {
  console.log(`Subscription deleted: ${subscription.id}`);
  
  const userId = await findUserByStripeCustomer(subscription.customer, subscription.metadata);
  if (userId) {
    await db.updateUserSubscription(userId, {
      plan: 'none',
      status: 'canceled',
      expiresAt: null
    });

    // Shutdown VMs immediately
    await subscriptionManager.shutdownVMsForInactiveSubscription(userId);

    db.logAction(userId, 'subscription_deleted', 'subscription', subscription.id, {
      reason: 'stripe_subscription_deleted'
    }, 'webhook');
  }

  return userId;
}

async function handleInvoicePaymentSucceeded(invoice) {
  console.log(`Invoice payment succeeded: ${invoice.id} - $${invoice.amount_paid / 100}`);
  
  const userId = await findUserByStripeCustomer(invoice.customer);
  if (userId && invoice.subscription) {
    // Record the payment
    await db.recordPayment({
      userId,
      stripeSubscriptionId: invoice.subscription,
      stripeCustomerId: invoice.customer,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      paymentMethod: 'subscription_renewal',
      planName: 'Subscription Renewal',
      metadata: { invoiceId: invoice.id }
    });

    db.logAction(userId, 'subscription_renewed', 'subscription', invoice.subscription, {
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency
    }, 'webhook');
  }

  return userId;
}

async function handleInvoicePaymentFailed(invoice) {
  console.log(`Invoice payment failed: ${invoice.id}`);
  
  const userId = await findUserByStripeCustomer(invoice.customer);
  if (userId) {
    // Record the failed payment attempt
    await db.recordPaymentAttempt({
      userId,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      failureCode: 'invoice_payment_failed',
      failureMessage: 'Subscription renewal payment failed'
    });

    db.logAction(userId, 'subscription_payment_failed', 'subscription', invoice.subscription, {
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      attemptCount: invoice.attempt_count
    }, 'webhook');

    // If final attempt failed, shutdown VMs
    if (invoice.attempt_count >= 4) {
      console.log(`Final payment attempt failed for ${userId}, shutting down VMs`);
      await subscriptionManager.shutdownVMsForInactiveSubscription(userId);
    }
  }

  return userId;
}

async function handleDisputeCreated(dispute) {
  console.log(`Dispute created: ${dispute.id} - Amount: $${dispute.amount / 100}`);
  
  // Find the related payment
  const payment = await db.statements.getPaymentByStripeId.get(dispute.payment_intent);
  if (payment) {
    await db.statements.insertDispute.run(
      payment.id,
      payment.user_id,
      dispute.id,
      dispute.charge,
      dispute.amount,
      dispute.currency,
      dispute.reason,
      dispute.status,
      dispute.evidence_details?.due_by,
      dispute.is_charge_refundable,
      JSON.stringify(dispute.metadata)
    );

    db.logAction(payment.user_id, 'payment_disputed', 'dispute', dispute.id, {
      amount: dispute.amount,
      reason: dispute.reason,
      chargeId: dispute.charge
    }, 'webhook');
  }
}

async function handleRefundCreated(refund) {
  console.log(`Refund created: ${refund.id} - Amount: $${refund.amount / 100}`);
  
  // Find the related payment
  const payment = await db.statements.getPaymentByStripeId.get(refund.payment_intent);
  if (payment) {
    await db.recordRefund({
      paymentId: payment.id,
      userId: payment.user_id,
      stripeRefundId: refund.id,
      stripePaymentIntentId: refund.payment_intent,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      metadata: refund.metadata
    });
  }
}

// Helper function to find user by Stripe customer ID
async function findUserByStripeCustomer(customerId, subscriptionMetadata = null) {
  if (!customerId) return null;
  
  try {
    // First try to find by customer ID in subscription_data (existing users)
    const result = db.db.prepare(`
      SELECT id FROM users 
      WHERE subscription_data LIKE ?
    `).get(`%"stripeCustomerId":"${customerId}"%`);
    
    if (result?.id) {
      console.log(`Found user ${result.id} by stored customer ID: ${customerId}`);
      return result.id;
    }
    
    // If not found and we have subscription metadata with userId, use that
    if (subscriptionMetadata?.userId) {
      const userId = parseInt(subscriptionMetadata.userId);
      console.log(`Customer ID lookup failed, trying metadata userId: ${userId}`);
      
      // Verify this user exists
      const user = await db.findUserById(userId);
      if (user) {
        console.log(`Found user ${userId} via subscription metadata`);
        return userId;
      }
    }
    
    console.log(`Could not find user for customer: ${customerId}`);
    return null;
  } catch (error) {
    console.error('Error finding user by Stripe customer:', error);
    return null;
  }
}

// Get user's payment history
router.get('/payment-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const payments = await db.getPaymentHistory(userId, parseInt(limit), offset);
    const refunds = await db.getUserRefunds(userId);

    res.json({
      payments,
      refunds,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: payments.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Request refund (user-initiated)
router.post('/request-refund', authenticateToken, async (req, res) => {
  try {
    const { paymentId, reason } = req.body;
    const userId = req.user.id;

    if (!stripe) {
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Get the payment details
    const payment = await db.statements.getPaymentById.get(paymentId);
    if (!payment || payment.user_id !== userId) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'succeeded') {
      return res.status(400).json({ error: 'Can only refund successful payments' });
    }

    // Check if payment is recent enough for refund (within 30 days)
    const paymentDate = new Date(payment.created_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (paymentDate < thirtyDaysAgo) {
      return res.status(400).json({ 
        error: 'Refunds are only available within 30 days of payment' 
      });
    }

    // Create the refund request (admin will need to approve)
    db.logAction(userId, 'refund_requested', 'refund', paymentId, {
      amount: payment.amount,
      reason,
      paymentDate: payment.created_at
    }, req.ip, userId);

    res.json({
      message: 'Refund request submitted successfully. Our team will review it within 24 hours.',
      paymentId,
      amount: `$${(payment.amount / 100).toFixed(2)}`,
      status: 'pending_review'
    });

  } catch (error) {
    console.error('Error requesting refund:', error);
    res.status(500).json({ error: 'Failed to submit refund request' });
  }
});

// Admin: Process refund
router.post('/admin/process-refund', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { paymentId, amount, reason, adminReason } = req.body;
    const adminUserId = req.user.id;

    if (!stripe) {
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Get the payment details
    const payment = await db.statements.getPaymentById.get(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (!payment.stripe_payment_intent_id) {
      console.log('No direct payment intent found, checking subscription/invoice...');
      
      // For subscription payments, we need to find the payment intent through the subscription
      if (payment.stripe_subscription_id) {
        console.log('Looking up subscription:', payment.stripe_subscription_id);
        
        try {
          // Get the subscription
          const subscription = await stripe.subscriptions.retrieve(payment.stripe_subscription_id);
          console.log('Subscription found:', subscription.id);
          
          // Get the latest invoice for this subscription
          const invoices = await stripe.invoices.list({
            subscription: payment.stripe_subscription_id,
            limit: 1
          });
          
          if (invoices.data.length > 0) {
            const invoice = invoices.data[0];
            console.log('Latest invoice found:', invoice.id);
            
            if (invoice.payment_intent) {
              console.log('Found payment intent from invoice:', invoice.payment_intent);
              // Use the payment intent from the invoice
              payment.stripe_payment_intent_id = invoice.payment_intent;
            } else {
              console.log('No payment intent found in invoice');
              return res.status(400).json({ error: 'Cannot process refund: No payment intent found for this subscription payment' });
            }
          } else {
            console.log('No invoices found for subscription');
            return res.status(400).json({ error: 'Cannot process refund: No invoices found for this subscription' });
          }
          
        } catch (stripeError) {
          console.error('Error retrieving subscription/invoice from Stripe:', stripeError);
          return res.status(400).json({ error: 'Cannot process refund: Unable to retrieve subscription details from Stripe' });
        }
        
      } else {
        console.log('No subscription ID either');
        return res.status(400).json({ error: 'Cannot process refund: No payment intent or subscription ID found for this payment' });
      }
    }

    // Process the refund through Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: amount || payment.amount, // Allow partial refunds
      reason: reason || 'requested_by_customer',
      metadata: {
        admin_user_id: adminUserId,
        admin_reason: adminReason,
        original_payment_id: paymentId
      }
    });

    // Record the refund in our database
    await db.recordRefund({
      paymentId,
      userId: payment.user_id,
      stripeRefundId: refund.id,
      stripePaymentIntentId: payment.stripe_payment_intent_id,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      adminUserId,
      adminReason,
      metadata: { processedBy: req.user.username }
    });

    res.json({
      message: 'Refund processed successfully',
      refund: {
        id: refund.id,
        amount: `$${(refund.amount / 100).toFixed(2)}`,
        status: refund.status
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// Admin: Get payment analytics
router.get('/admin/analytics', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const analytics = await db.getPaymentAnalytics();
    
    // Get additional stats
    const failedPaymentsQuery = db.db.prepare(`
      SELECT COUNT(*) as count, SUM(amount) as total_amount
      FROM payment_attempts 
      WHERE status = 'failed' AND created_at >= date('now', '-30 days')
    `);
    const failedPayments = failedPaymentsQuery.get();

    const disputesQuery = db.db.prepare(`
      SELECT COUNT(*) as count, SUM(amount) as total_amount
      FROM payment_disputes 
      WHERE created_at >= date('now', '-30 days')
    `);
    const disputes = disputesQuery.get();

    const refundsQuery = db.db.prepare(`
      SELECT COUNT(*) as count, SUM(amount) as total_amount
      FROM refunds 
      WHERE status = 'succeeded' AND created_at >= date('now', '-30 days')
    `);
    const refunds = refundsQuery.get();

    res.json({
      ...analytics,
      failedPayments: {
        count: failedPayments.count,
        totalAmount: `$${((failedPayments.total_amount || 0) / 100).toFixed(2)}`
      },
      disputes: {
        count: disputes.count,
        totalAmount: `$${((disputes.total_amount || 0) / 100).toFixed(2)}`
      },
      refunds: {
        count: refunds.count,
        totalAmount: `$${((refunds.total_amount || 0) / 100).toFixed(2)}`
      }
    });

  } catch (error) {
    console.error('Error fetching payment analytics:', error);
    res.status(500).json({ error: 'Failed to fetch payment analytics' });
  }
});

// Admin: Get all payments with filters
router.get('/admin/payments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { 
      page = 1, 
      limit = 50, 
      status, 
      user_id, 
      plan_id,
      start_date,
      end_date 
    } = req.query;

    let query = `
      SELECT p.*, u.username, u.email 
      FROM payments p 
      LEFT JOIN users u ON p.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    if (user_id) {
      query += ' AND p.user_id = ?';
      params.push(user_id);
    }

    if (plan_id) {
      query += ' AND p.plan_id = ?';
      params.push(plan_id);
    }

    if (start_date) {
      query += ' AND p.created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND p.created_at <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const stmt = db.db.prepare(query);
    const payments = stmt.all(...params);

    // Format the payments
    const formattedPayments = payments.map(payment => ({
      ...payment,
      metadata: payment.metadata ? JSON.parse(payment.metadata) : null,
      amountFormatted: `$${(payment.amount / 100).toFixed(2)}`
    }));

    res.json({
      payments: formattedPayments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: payments.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching admin payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get upgrade pricing preview
router.post('/preview-upgrade', authenticateToken, async (req, res) => {
  try {
    const { planType, vmCount, planName } = req.body;
    const userId = req.user.id;
    
    console.log('Previewing upgrade pricing:', { planType, vmCount, planName, userId });

    // Validate plan type
    if (!PRICING_MATRIX[planType]) {
      return res.status(400).json({ error: 'Invalid plan type selected' });
    }

    // Validate VM count
    if (!vmCount || vmCount < 1 || vmCount > 10) {
      return res.status(400).json({ error: 'Invalid VM count. Must be between 1-10' });
    }

    // Get user's current subscription
    const user = await db.findUserById(userId);
    if (!user?.subscription?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (!stripe) {
      // Return calculated pricing in demo mode
      const newPricing = calculateCustomPricing(planType, vmCount);
      return res.json({
        newPlan: {
          name: planName,
          planType: planType,
          vmCount: vmCount,
          monthlyPrice: newPricing.price,
          perVMPrice: newPricing.perVM
        },
        currentPlan: {
          name: user.subscription.plan
        },
        preview: true,
        demoMode: true
      });
    }

    // Get current subscription from Stripe
    const currentSubscription = await stripe.subscriptions.retrieve(user.subscription.stripeSubscriptionId);
    
    if (currentSubscription.status !== 'active') {
      return res.status(400).json({ error: 'Cannot preview upgrade for inactive subscription' });
    }

    // Calculate new pricing
    const newPricing = calculateCustomPricing(planType, vmCount);
    if (!newPricing) {
      return res.status(400).json({ error: 'Unable to calculate pricing for this configuration' });
    }

    // Get current plan pricing (estimate from current subscription item)
    const currentSubscriptionItem = currentSubscription.items.data[0];
    const currentMonthlyAmount = currentSubscriptionItem.price.unit_amount / 100;

    // Calculate proration info
    const currentPeriodStart = new Date(currentSubscription.current_period_start * 1000);
    const currentPeriodEnd = new Date(currentSubscription.current_period_end * 1000);
    const now = new Date();
    const totalPeriodDays = Math.ceil((currentPeriodEnd.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const daysUsed = totalPeriodDays - daysRemaining;

    // Calculate proration amounts
    const unusedCurrentAmount = (currentMonthlyAmount * daysRemaining) / totalPeriodDays;
    const newProrationAmount = (newPricing.price * daysRemaining) / totalPeriodDays;
    const immediateCharge = newProrationAmount - unusedCurrentAmount;

    res.json({
      currentPlan: {
        name: user.subscription.plan,
        monthlyPrice: currentMonthlyAmount,
        billingPeriod: {
          start: currentPeriodStart,
          end: currentPeriodEnd,
          daysRemaining: daysRemaining,
          daysUsed: daysUsed
        }
      },
      newPlan: {
        name: planName,
        planType: planType,
        vmCount: vmCount,
        monthlyPrice: newPricing.price,
        perVMPrice: newPricing.perVM
      },
      proration: {
        immediateCharge: Math.max(0, Math.round(immediateCharge * 100) / 100),
        credit: Math.max(0, Math.round(-immediateCharge * 100) / 100),
        daysRemaining: daysRemaining,
        nextBillingDate: currentPeriodEnd,
        explanation: immediateCharge > 0 
          ? `You'll be charged $${Math.round(immediateCharge * 100) / 100} immediately for the upgrade for the remaining ${daysRemaining} days.`
          : immediateCharge < 0
          ? `You'll receive a $${Math.round(-immediateCharge * 100) / 100} credit immediately for downgrading for the remaining ${daysRemaining} days.`
          : 'No immediate charge - plans have the same prorated cost.',
        willChargeNow: true
      },
      savings: {
        monthlyDifference: newPricing.price - currentMonthlyAmount,
        isUpgrade: newPricing.price > currentMonthlyAmount,
        isDowngrade: newPricing.price < currentMonthlyAmount
      }
    });

  } catch (error) {
    console.error('Error previewing upgrade:', error);
    res.status(500).json({ error: 'Failed to preview upgrade pricing' });
  }
});

// Debug endpoint to check webhook configuration
router.get('/debug/webhook-config', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  res.json({
    stripe: {
      configured: !!stripe,
      webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      secretPreview: process.env.STRIPE_WEBHOOK_SECRET ? 
        `${process.env.STRIPE_WEBHOOK_SECRET.substring(0, 8)}...` : 'Not set'
    },
    vmProvisioning: {
      available: !!vmProvisioning
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      corsOrigin: process.env.CORS_ORIGIN
    }
  });
});

// Debug endpoint to manually trigger VM provisioning for testing
router.post('/debug/trigger-vm-provisioning', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { userId, planType = 'hour_booster', vmCount = 1 } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    console.log(`Manual VM provisioning triggered by admin for user ${userId}`);
    
    const result = await vmProvisioning.provisionVMsForUser(userId, {
      id: 'debug-provision',
      metadata: {
        planType: planType,
        vmCount: vmCount.toString(),
        planName: `Debug ${planType}`
      },
      planType: planType,
      vmCount: vmCount,
      planName: `Debug ${planType}`,
      nickname: `Debug ${planType}`
    });

    res.json({
      success: true,
      result: result,
      message: 'VM provisioning triggered successfully'
    });

  } catch (error) {
    console.error('Debug VM provisioning failed:', error);
    res.status(500).json({ 
      error: 'VM provisioning failed', 
      details: error.message 
    });
  }
});

// Debug endpoint to manually provision VMs for users who missed webhook provisioning
router.post('/debug/provision-missing-vms', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    console.log(`Manual VM provisioning check for user ${userId}`);
    
    // Get user details
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has active subscription but no VMs
    if (!user.subscription || user.subscription.plan === 'none') {
      return res.status(400).json({ error: 'User has no active subscription' });
    }

    const userVMs = db.getUserVMIds(userId);
    if (userVMs.length > 0) {
      return res.status(400).json({ 
        error: 'User already has VMs assigned',
        vmIds: userVMs 
      });
    }

    // Extract plan details from subscription
    let planType = 'hour_booster';
    let vmCount = 1;
    
    if (user.subscription.plan.toLowerCase().includes('booster')) {
      planType = 'hour_booster';
    } else if (user.subscription.plan.toLowerCase().includes('dual')) {
      planType = 'dual_mode';
    } else if (user.subscription.plan.toLowerCase().includes('kd') || user.subscription.plan.toLowerCase().includes('drop')) {
      planType = 'kd_drop';
    }

    console.log(`Provisioning VMs for user ${userId} with plan ${user.subscription.plan} (${planType})`);
    
    const result = await vmProvisioning.provisionVMsForUser(userId, {
      id: user.subscription.stripeSubscriptionId || 'manual-provision',
      metadata: {
        planType: planType,
        vmCount: vmCount.toString(),
        planName: user.subscription.plan
      },
      planType: planType,
      vmCount: vmCount,
      planName: user.subscription.plan,
      nickname: user.subscription.plan
    });

    res.json({
      success: true,
      message: `VM provisioning completed for user ${user.username}`,
      result: result,
      user: {
        id: user.id,
        username: user.username,
        subscription: user.subscription
      }
    });

  } catch (error) {
    console.error('Manual VM provisioning failed:', error);
    res.status(500).json({ 
      error: 'VM provisioning failed', 
      details: error.message 
    });
  }
});

module.exports = router;