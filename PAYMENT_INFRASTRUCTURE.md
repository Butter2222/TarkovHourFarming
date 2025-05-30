# Comprehensive Payment Infrastructure Documentation

## Overview
This document outlines the complete payment infrastructure implemented for TarkovBoost Pro, providing comprehensive tracking, logging, and management of all payment-related activities through Stripe integration.

## 🏗️ Database Architecture

### Payment Tracking Tables

#### `payments`
**Purpose**: Track all payment transactions
- `id` - Primary key
- `user_id` - Reference to user
- `stripe_payment_intent_id` - Stripe payment intent ID
- `stripe_checkout_session_id` - Stripe checkout session ID
- `stripe_subscription_id` - Stripe subscription ID
- `stripe_customer_id` - Stripe customer ID
- `amount` - Amount in cents
- `currency` - Payment currency (default: USD)
- `status` - Payment status (pending, succeeded, failed, canceled, refunded)
- `payment_method` - Payment method used
- `plan_id` - Subscription plan ID (basic, premium)
- `plan_name` - Human-readable plan name
- `metadata` - JSON metadata
- `created_at`, `updated_at` - Timestamps

#### `payment_attempts`
**Purpose**: Track failed payment attempts and retries
- `payment_id` - Reference to payment
- `user_id` - Reference to user
- `stripe_payment_intent_id` - Stripe payment intent
- `amount` - Attempted amount
- `status` - Attempt status
- `failure_code` - Stripe failure code
- `failure_message` - Human-readable failure reason
- `payment_method_id` - Payment method attempted
- `last_payment_error` - Full error details (JSON)

#### `refunds`
**Purpose**: Track all refund transactions
- `payment_id` - Reference to original payment
- `user_id` - Reference to user
- `stripe_refund_id` - Stripe refund ID
- `amount` - Refunded amount in cents
- `reason` - Refund reason
- `status` - Refund status
- `admin_user_id` - Admin who processed refund
- `admin_reason` - Admin's reason for refund

#### `stripe_webhooks`
**Purpose**: Track and process Stripe webhook events
- `stripe_event_id` - Unique Stripe event ID
- `event_type` - Type of webhook event
- `object_id` - ID of the Stripe object
- `user_id` - Associated user (if applicable)
- `raw_data` - Complete webhook payload (JSON)
- `processed` - Whether event has been processed
- `processing_error` - Any errors during processing

#### `payment_disputes`
**Purpose**: Track payment disputes and chargebacks
- `stripe_dispute_id` - Stripe dispute ID
- `stripe_charge_id` - Associated charge ID
- `amount` - Disputed amount
- `reason` - Dispute reason
- `status` - Dispute status
- `evidence_deadline` - Deadline for evidence submission

## 🔄 Webhook Processing

### Supported Webhook Events

#### Payment Events
- `payment_intent.succeeded` - Successful payment
- `payment_intent.payment_failed` - Failed payment
- `invoice.payment_succeeded` - Subscription renewal success
- `invoice.payment_failed` - Subscription renewal failure

#### Subscription Events
- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Subscription changes
- `customer.subscription.deleted` - Subscription cancellation

#### Dispute & Refund Events
- `charge.dispute.created` - New payment dispute
- `refund.created` - Refund processed

### Webhook Security
- Signature verification using `STRIPE_WEBHOOK_SECRET`
- Duplicate event detection
- Error handling and retry logic
- Complete audit trail

## 📊 Payment Analytics

### Available Metrics
- **Revenue Analytics**
  - Total revenue (30-day period)
  - Revenue by plan (Basic vs Premium)
  - Average payment amount
  - Payment success rate

- **Failure Analytics**
  - Failed payment count and amounts
  - Payment dispute statistics
  - Refund tracking and totals
  - Failed payment attempt patterns

### Admin Dashboard Endpoints
- `GET /api/payment/admin/analytics` - Complete payment analytics
- `GET /api/payment/admin/payments` - All payments with filtering
- `POST /api/payment/admin/process-refund` - Process refunds

## 🛡️ Security & Compliance

### Payment Security
- All payment processing through Stripe (PCI compliant)
- No sensitive payment data stored locally
- Webhook signature verification
- Audit logs for all payment actions

### Data Protection
- User payment history accessible only to account owner
- Admin-only access to aggregate analytics
- Secure refund processing with admin approval
- Complete audit trail for compliance

## 🔧 API Endpoints

### Customer Endpoints
```
POST /api/payment/create-checkout-session
POST /api/payment/verify-checkout-session
GET  /api/payment/subscription-status
GET  /api/payment/payment-history
POST /api/payment/request-refund
POST /api/payment/cancel-subscription
POST /api/payment/reactivate-subscription
```

### Admin Endpoints
```
GET  /api/payment/admin/analytics
GET  /api/payment/admin/payments
POST /api/payment/admin/process-refund
```

### Webhook Endpoint
```
POST /api/payment/webhook
```

## 💰 Payment Flow

### Subscription Purchase
1. User selects plan and clicks "Subscribe"
2. `create-checkout-session` creates Stripe checkout
3. User completes payment on Stripe-hosted page
4. Stripe redirects back with session ID
5. `verify-checkout-session` confirms payment
6. Payment recorded in database
7. User subscription activated
8. Audit log created

### Webhook Processing
1. Stripe sends webhook to `/api/payment/webhook`
2. Signature verified for security
3. Event recorded in `stripe_webhooks` table
4. Event processed based on type
5. Database updated accordingly
6. VM shutdown triggered if subscription becomes inactive
7. Audit logs created

### Refund Process
1. Customer requests refund via API
2. Refund request logged for admin review
3. Admin processes refund through admin panel
4. Stripe refund created
5. Refund recorded in database
6. Customer and admin notified

## 🚨 Failed Payment Handling

### Automatic Retry Logic
- Stripe handles automatic payment retries
- Up to 4 attempts for subscription renewals
- VM shutdown after final failed attempt

### Failed Payment Tracking
- Each attempt logged in `payment_attempts`
- Failure codes and messages stored
- Admin visibility into failure patterns
- Customer notification of payment issues

## 📋 Audit & Compliance

### Complete Audit Trail
- All payment actions logged with timestamps
- User and admin actions tracked separately
- IP addresses recorded for security
- Metadata preserved for investigation

### Compliance Features
- PCI DSS compliance through Stripe
- GDPR-ready data handling
- Complete transaction history
- Secure data deletion on account removal

## 🔍 Monitoring & Alerts

### Payment Monitoring
- Real-time webhook processing
- Failed payment notifications
- Dispute alert system
- Revenue tracking and reporting

### Error Handling
- Webhook processing errors logged
- Failed payment retry notifications
- System health monitoring
- Automatic recovery mechanisms

## 🚀 Getting Started

### Environment Variables Required
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PREMIUM=price_...
```

### Webhook Configuration
1. Configure webhook endpoint: `https://yourdomain.com/api/payment/webhook`
2. Select events to listen for (see Supported Webhook Events)
3. Copy webhook signing secret to environment variables
4. Test webhook delivery

### Testing
- Use Stripe test cards for payment testing
- Webhook testing with Stripe CLI
- Failed payment scenario testing
- Refund process testing

This comprehensive payment infrastructure provides complete visibility into all payment activities, robust error handling, and secure processing of all financial transactions. 