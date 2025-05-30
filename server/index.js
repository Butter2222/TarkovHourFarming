const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/auth');
const vmRoutes = require('./routes/vm');
const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const db = require('./services/database');

// Initialize subscription manager for automatic VM shutdown on expired subscriptions
require('./services/subscriptionManager');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy specifically for Cloudflare (more secure than 'true')
// Cloudflare IP ranges - you can also use specific IPs
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Security middleware with production configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration with dev/prod separation
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // In development, allow localhost origins
    if (process.env.NODE_ENV === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    // Production allowed origins (from environment variables)
    const allowedOrigins = [
      process.env.CORS_ORIGIN,      // e.g., https://vm.mwpriv.com
      process.env.FRONTEND_URL      // backup frontend URL if different
    ].filter(Boolean);
    
    // In development, also allow localhost origins
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Body parsing middleware
// Special handling for Stripe webhook - needs raw body
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging - only in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Production logging - less verbose
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Proxmox VM Dashboard API'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vm', vmRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../client/build')));

// Catch all handler: send back React's index.html file for non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' });
  } else {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  }
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error details for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.error('Error details:', err.stack);
  } else {
    // In production, only log essential error info
    console.error('Error:', err.message);
  }
  
  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
}); 