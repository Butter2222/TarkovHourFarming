const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // CRITICAL: Verify session matches the JWT user to prevent account mix-ups
    if (req.session && req.session.userId && req.session.userId !== decoded.id) {
      console.error(`SESSION MISMATCH: JWT user ${decoded.id} vs Session user ${req.session.userId}`);
      // Clear the compromised session
      req.session.destroy((destroyErr) => {
        if (destroyErr) console.error('Session destroy error:', destroyErr);
      });
      return res.status(403).json({ 
        error: 'Session security violation detected. Please log in again.',
        code: 'SESSION_MISMATCH'
      });
    }

    // Update session with current user info for security tracking
    if (req.session) {
      req.session.userId = decoded.id;
      req.session.username = decoded.username;
      req.session.role = decoded.role;
      req.session.lastActivity = new Date().toISOString();
    }

    req.user = decoded;
    req.token = token;
    next();
  });
};

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '24h'
  });
};

module.exports = {
  authenticateToken,
  generateToken
}; 