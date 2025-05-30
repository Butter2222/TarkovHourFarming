const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Debug environment loading
console.log('🔍 Environment Debug:');
console.log('JWT_SECRET loaded:', process.env.JWT_SECRET ? '[SET]' : '[NOT SET]');
console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);
console.log('Working directory:', process.cwd());
console.log('__dirname:', __dirname);

const authRoutes = require('./routes/auth');
const vmRoutes = require('./routes/vm');
const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy specifically for Cloudflare (more secure than 'true')
// Cloudflare IP ranges - you can also use specific IPs
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
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
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
}); 