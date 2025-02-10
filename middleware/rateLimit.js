// backend/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // max 10 posts per hour per IP
  message: 'Too many posts created from this IP, please try again after an hour',
  keyGenerator: function (req /*, res*/) {
    return req.ip // use ip address as key
  },
  handler: function (req, res, next) {
    console.warn(`Rate limit triggered for IP: ${req.ip} on POST creation`);
    return res.status(429).json({ message: this.message });
  }
});

const commentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // max 5 comments per minute per IP
  message: 'Too many comments created from this IP, please try again after a minute',
  keyGenerator: function (req /*, res*/) {
    return req.ip // use ip address as key
  },
  handler: function (req, res, next) {
    console.warn(`Rate limit triggered for IP: ${req.ip} on COMMENT creation`);
    return res.status(429).json({ message: this.message });
  }
});

module.exports = { postLimiter, commentLimiter };