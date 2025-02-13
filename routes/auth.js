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

  // Get unread notifications with details
  router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // 1. Find all comments where the user is the author
        const userComments = await Comment.find({ author: userId }).populate({
            path: 'replies',
            populate: {
                path: 'author',
                select: 'username' // Select only the username of the reply author
            }
        });

        // Filter out comments that have unread replies
        const newResponses = userComments.filter(comment =>
            comment.replies.some(reply => reply.author._id.toString() !== userId)
        );

        // Map the new responses to include relevant information for REPLIES
        const replyNotifications = newResponses.map(comment => ({
            type: 'reply', // **CRITICAL: Add the type**
            postId: comment.post, // Reference to the post
            commentId: comment._id, // Reference to the comment
            commentText: comment.text, // Comment text
            replyAuthor: comment.replies.find(reply => reply.author._id.toString() !== userId).author.username, // Username of the first reply author
            replyText: comment.replies.find(reply => reply.author._id.toString() !== userId).text // The text of the first reply author
        }));

         // 2. Find all posts where the user is the author and find new comments on those posts
        const userPosts = await Post.find({ author: userId }).populate({
          path: 'comments',
          populate: {
            path: 'author',
            select: 'username'
          }
        });

        const newPostComments = await Promise.all(userPosts.map(async post => {
          await post.populate({
            path: 'comments',
            populate: {
              path: 'author',
              select: 'username'
            }
          });
          return post;
        }));

        const commentNotifications = newPostComments.map(post => ({
            type: 'comment', // **CRITICAL: Add the type**
            postId: post._id,
            postTitle: post.title,
            commentAuthor: post.comments.find(comment => comment.author._id.toString() !== userId).author.username,
            commentText: post.comments.find(comment => comment.author._id.toString() !== userId).text
        }));

        // Combine the notifications
        const notifications = [...replyNotifications, ...commentNotifications];

        // Get total unread notifications count
        const unreadNotifications = notifications.length

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
          if (comment.replies && Array.isArray(comment.replies)) { // Add check here
              for (let reply of comment.replies) {
                  if (reply.readBy && !reply.readBy.includes(userId)) {
                      reply.readBy.push(userId);
                      await reply.save();
                  }
              }
          }
      }

      res.json({ message: 'Notifications cleared' });
  } catch (error) {
      console.error("Error resetting notifications:", error);
      res.status(500).json({ message: "Failed to reset notifications", error: error.message });
  }
});
  
  
  module.exports = router;