# Stripe Integration Setup Guide

## Overview
The TarkovBoost Pro dashboard includes full Stripe integration for subscription management. This guide will help you set up payment processing.

## Required Environment Variables

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_PRICE_BASIC=price_basic_monthly_id_from_stripe
STRIPE_PRICE_PREMIUM=price_premium_monthly_id_from_stripe
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
```

## Stripe Dashboard Setup

### 1. Create Stripe Account
- Go to [https://stripe.com](https://stripe.com)
- Create an account or log in
- Switch to test mode for development

### 2. Create Products and Prices
1. **Basic Plan:**
   - Navigate to Products → Add Product
   - Name: "Basic Plan"
   - Price: $12/month recurring
   - Copy the Price ID (starts with `price_`) to `STRIPE_PRICE_BASIC`

2. **Premium Plan:**
   - Navigate to Products → Add Product  
   - Name: "Premium Plan"
   - Price: $20/month recurring
   - Copy the Price ID (starts with `price_`) to `STRIPE_PRICE_PREMIUM`

### 3. Get API Keys
1. Navigate to Developers → API Keys
2. Copy **Publishable key** (starts with `pk_test_`) to `STRIPE_PUBLISHABLE_KEY`
3. Copy **Secret key** (starts with `sk_test_`) to `STRIPE_SECRET_KEY`

### 4. Set Up Webhooks
1. Navigate to Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://yourdomain.com/api/payment/webhook`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`) to `STRIPE_WEBHOOK_SECRET`

## Installation

Install Stripe SDK:
```bash
cd server && npm install stripe
```

## Features Included

### ✅ Subscription Management
- **Plan Selection:** Basic ($12/month) and Premium ($20/month)
- **Secure Checkout:** Stripe-hosted checkout pages
- **Subscription Status:** Real-time status tracking
- **Plan Changes:** Upgrade/downgrade functionality
- **Cancellation:** Cancel at period end

### ✅ Webhook Handling
- **Payment Confirmation:** Automatic subscription activation
- **Subscription Updates:** Status changes sync to database
- **Failed Payments:** Automatic handling and logging
- **Audit Trail:** Complete payment history logging

### ✅ Security Features
- **Webhook Verification:** Signature validation
- **Secure Storage:** Encrypted customer data
- **PCI Compliance:** No card data stored locally
- **Audit Logging:** All actions tracked

## Testing

### Test Mode
The system works in demo mode without Stripe keys for development:
- Shows plan selection interface
- Displays "Demo mode" messages
- No actual payment processing

### With Stripe Test Keys
Use Stripe's test card numbers:
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **3D Secure:** `4000 0025 0000 3155`

## Production Deployment

1. **Switch to Live Mode:**
   - Replace all test keys with live keys
   - Update webhook endpoint to production URL
   - Set `NODE_ENV=production`

2. **SSL Certificate:**
   - Webhooks require HTTPS in production
   - Use Let's Encrypt or your hosting provider's SSL

3. **Domain Configuration:**
   - Update `CLIENT_URL` to your production domain
   - Configure CORS settings appropriately

## Database Schema

The system automatically creates subscription-related database fields:
- `users.subscription_plan` - Current plan name
- `users.subscription_expires_at` - Expiration date
- `users.subscription_data` - JSON data for Stripe IDs and metadata

## Error Handling

- **Network Errors:** Graceful fallback to demo mode
- **Invalid Plans:** Validation and error messages
- **Failed Payments:** Automatic retry logic via Stripe
- **Webhook Failures:** Retry mechanism built into Stripe

## Support

For Stripe-specific issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)

For application issues:
- Check server logs for detailed error messages
- Verify environment variables are set correctly
- Ensure webhook endpoint is accessible from internet 