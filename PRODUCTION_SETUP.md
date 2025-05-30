# Production Setup Guide

## Environment Configuration

For production deployment, update your `.env` file with:

### Required Changes:
```env
# Set to production
NODE_ENV=production

# Generate a new, secure JWT secret (128+ characters)
JWT_SECRET=generate_new_secure_random_string_here

# Update CORS to your actual domain
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com

# Use live Stripe keys (if applicable)
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
```

### Security Checklist:
- [ ] Change default admin password
- [ ] Generate new JWT_SECRET 
- [ ] Update CORS_ORIGIN to your domain
- [ ] Use HTTPS in production
- [ ] Enable firewall (only ports 80, 443, SSH)
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity

### PM2 Production Configuration:
```bash
# Update PM2 to load new environment
pm2 restart all --update-env

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Performance Optimizations:
- Static files served by Express
- Gzip compression enabled via helmet
- Rate limiting configured
- Proper error handling (no stack traces exposed)

### Monitoring:
```bash
# View logs
pm2 logs

# Monitor resources
pm2 monit

# Check status
pm2 status
```

### Database Backup:
```bash
# Backup database regularly
cp server/data/database.db backup/database_$(date +%Y%m%d_%H%M%S).db
```

## Build and Deploy:

1. **Build frontend:**
```bash
cd client && npm run build && cd ..
```

2. **Restart services:**
```bash
pm2 restart all
```

3. **Verify deployment:**
- Check logs: `pm2 logs`
- Test login functionality
- Verify VM management works
- Check all API endpoints 