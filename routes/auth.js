// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth'); // ✅ Import authentication middleware
const Post = require('../models/Post'); // Import the Post model
const Comment = require('../models/Comment'); // Import the Comment model

// Middleware to limit registration attempts per IP address
const registrationLimiter = (req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.ip; // Get IP from Cloudflare or fallback
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds

    // Initialize IP if not present
    if (!registrationAttempts[ip]) {
        registrationAttempts[ip] = [];
    }

    // Clean up old attempts (older than one day)
    registrationAttempts[ip] = registrationAttempts[ip].filter(time => now - time < oneDay);

    if (registrationAttempts[ip].length >= 5) {
        console.warn(`Registration limit exceeded for IP: ${ip}`);
        return res.status(429).json({ message: 'Too many accounts created from this IP address today. Please try again tomorrow.' });
    }

    // Add the current attempt
    registrationAttempts[ip].push(now);
    next(); // Proceed to the registration route
};

// Register route (modified)
router.post('/register', registrationLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        // Basic validation
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        // Create new user (password hashing happens in the User model's pre-save hook)
        const newUser = new User({ username, password });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed', error: error.message });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Received login request:'); // ADDED
        console.log('  Username:', username); // ADDED
        console.log('  Password:', password); // ADDED

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = await User.findOne({ username });
        console.log('Found user:', user); // ADDED

        if (!user) {
            console.log('User not found'); // ADDED
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        console.log('Password match:', isMatch); // ADDED

        if (!isMatch) {
            console.log('Password does not match'); // ADDED
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ message: 'Login successful', token, userId: user._id, username: user.username }); // MUST have username here

    } catch (error) {
        console.error('Login failed:', error); // This should log the error to your terminal
        res.status(500).json({ message: 'Login failed', error: error.message }); // Send error response
    }
});
  
  
  // Logout -  Client-side handles token removal
  router.post('/logout', (req, res) => {
      // On the client-side, remove the JWT from local storage or cookies.  There's no server-side session to invalidate with JWT.
      res.status(200).json({ message: 'Logout successful' });
  });

 // backend/routes/auth.js - In the notifications route
 router.get('/notifications', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.userId;

      // 1. Find all comments where the user is the author
      const userComments = await Comment.find({ author: userId }).populate({
          path: 'replies',
          populate: {
              path: 'author',
              select: 'username'
          }
      });

      // Filter out comments that have unread replies
      const newResponses = userComments.filter(comment =>
          comment.replies.some(reply => !reply.readBy.includes(userId))
      );

      // Map the new responses to include relevant information
      const replyNotifications = newResponses.map(comment => ({
          type: 'reply',
          postId: comment.post, 
          commentId: comment._id,
          commentText: comment.text,
          replyAuthor: comment.replies.find(reply => !reply.readBy.includes(userId)).author.username,
          replyText: comment.replies.find(reply => !reply.readBy.includes(userId)).text
      }));

      // 2. Find all posts where the user is the author and find new comments on those posts
      const userPosts = await Post.find({ author: userId }).populate({
          path: 'comments',
          populate: {
              path: 'author',
              select: 'username'
          }
      });

      const newPostComments = userPosts.filter(post =>
          post.comments.some(comment => comment.author._id.toString() !== userId)
      );

      const commentNotifications = newPostComments.map(post => ({
          type: 'comment',
          postId: post._id,
          postTitle: post.title,
          commentAuthor: post.comments.find(comment => comment.author._id.toString() !== userId).author.username,
          commentText: post.comments.find(comment => comment.author._id.toString() !== userId).text
      }));

      // Combine the notifications
      const notifications = [...replyNotifications, ...commentNotifications];

      // Get total unread notifications count
      const unreadNotifications = notifications.length;

      res.json({ unreadNotifications, notifications });
  } catch (error) {
      console.error("Error fetching notifications with details:", error);
      res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
});




// Reset unread notifications count (when user clicks profile)
router.post('/reset-notifications', authenticateToken, async (req, res) => {
  try {
      const userId = req.user.userId;
      // Find all comments by the user
      const userComments = await Comment.find({ author: userId }).populate('replies');

      // For each comment, go through all replies and if the current user hasn't read it
      for (let comment of userComments) {
          if (comment.replies && Array.isArray(comment.replies)) {
              for (let reply of comment.replies) {
                  if (reply.readBy && !reply.readBy.includes(userId)) {
                      reply.readBy.push(userId);
                      await reply.save();
                  }
              }
          }
      }

      // Reset the user's unread notifications count
      await User.findByIdAndUpdate(userId, { $set: { unreadNotifications: 0 } });

      res.json({ message: 'Notifications cleared' });
  } catch (error) {
      console.error("Error resetting notifications:", error);
      res.status(500).json({ message: "Failed to reset notifications", error: error.message });
  }
});
  
  
  module.exports = router;