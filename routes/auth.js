// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth'); // ✅ Import authentication middleware
const Post = require('../models/Post'); // Import the Post model
const Comment = require('../models/Comment'); // Import the Comment model

// Register route
router.post('/register', async (req, res) => {
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

      // ... (previous code for fetching userComments)

      const replyNotifications = newResponses.map(comment => {
          const unreadReply = comment.replies.find(reply => !reply.readBy.includes(userId));
          if (unreadReply) {
              return {
                  type: 'reply',
                  postId: comment.post, 
                  commentId: comment._id,
                  commentText: comment.text,
                  replyAuthor: unreadReply.author.username,
                  replyText: unreadReply.text
              };
          }
          return null;
      }).filter(Boolean);

      // ... (previous code for fetching userPosts)

      const commentNotifications = newPostComments.map(post => {
          const newComment = post.comments.find(comment => comment.author._id.toString() !== userId);
          if (newComment) {
              return {
                  type: 'comment',
                  postId: post._id,
                  postTitle: post.title,
                  commentAuthor: newComment.author.username,
                  commentText: newComment.text
              };
          }
          return null;
      }).filter(Boolean);

      const notifications = [...replyNotifications, ...commentNotifications];

      // If you start tracking read status for comments, adjust this count
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