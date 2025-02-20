// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth'); // ✅ Import authentication middleware
const Post = require('../models/Post'); // Import the Post model
const Comment = require('../models/Comment'); // Import the Comment model
const upload = require('../middleware/upload'); // <--- IMPORT IT HERE, AT THE TOP!
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');  //Import mongoose

// In-memory store for registration attempts (consider Redis for production)
const registrationAttempts = {};  // <--- DECLARE IT HERE, BEFORE THE MIDDLEWARE!

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
        //console.log('Received login request:'); // ADDED
        //console.log('  Username:', username); // ADDED
        //console.log('  Password:', password); // ADDED

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = await User.findOne({ username });
        //console.log('Found user:', user); // ADDED

        if (!user) {
            //console.log('User not found'); // ADDED
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        //console.log('Password match:', isMatch); // ADDED

        if (!isMatch) {
            //console.log('Password does not match'); // ADDED
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

 // In the notifications route
 router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        console.log("Notification route hit!");
        const userId = req.user.userId;
        console.log("User ID from token:", userId);

        const notifications = []; // Array to store notifications
        const limit = 5; // Limit the number of notifications to retrieve

        // 1. Find new replies to comments on *your* posts
        const unreadReplyNotificationsOwnPost = await Comment.find({
            post: { $in: await Post.find({ author: userId }).distinct('_id') }, // Find comments related to your posts
            author: { $ne: userId }, // Ensure the comment author is not the same as the user
            parentComment: { $ne: null } // Only replies
        })
        .sort({ createdAt: -1 })  // Sort by createdAt descending
        .populate('post').populate('author', 'username').limit(limit);

        // 2. Find new comments on *your* posts
        const newPostComments = await Post.find({ author: userId })
        .sort({ createdAt: -1 })   // Sort by createdAt descending
        .populate('comments').populate('author', 'username').limit(limit);

        // 3. Find new replies to your comments on *other* posts
        const unreadReplyNotificationsOtherPost = await Comment.find({
            parentComment: { $in: await Comment.find({ author: userId }).distinct('_id') },
            author: { $ne: userId } // Ensure the comment author is not you
        }).sort({ createdAt: -1 })
        .populate({
            path: 'parentComment',
            populate: { path: 'post' }
        })
        .populate('author', 'username')
        .limit(limit);


        // Process and structure the notifications
        unreadReplyNotificationsOwnPost.forEach(reply => {
            notifications.push({
                message: `New reply(新回复) by ${reply.author.username} on a comment in your post: ${reply.post.title}`,
                postId: reply.post?._id || null,
                activityType: "replyOwn"
            });
        });

        newPostComments.forEach(post => {
            notifications.push({
                message: `New comment(新评论) on your post: ${post.title} by ${post.author.username}`,
                postId: post._id || null,
                activityType: "comment"
            });
        });

        unreadReplyNotificationsOtherPost.forEach(reply => {
            notifications.push({
                message: `New reply(新回复) by ${reply.author.username} to your comment on post: ${reply.parentComment.post.title}`,
                postId: reply.parentComment.post._id || null,
                activityType: "replyOther"
            });
        });

        // Sort notifications by creation date (most recent first)
        notifications.sort((a, b) => b.createdAt - a.createdAt);

        let message = "No new activity.";
        if (notifications.length > 0) {
            message = null; // clear "No new activity." message
        }

        const user = await User.findById(userId);
        const unreadNotifications = user.unreadNotifications;
        console.log("unreadNotifications from user:", unreadNotifications)
        res.json({
            unreadNotifications: unreadNotifications,
            notifications: notifications.slice(0, limit), // Limit the number of notifications sent
            message: message,
            //activityType: activityType // Include activity type in the response
        });

    } catch (error) {
        console.error("Error fetching notifications with details:", error);
        res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
    }
});

// Reset unread notifications count (when user clicks profile)
router.post('/reset-notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        //console.log(`Resetting notifications for user: ${userId}`);

        // Reset the user's unread notifications count even if no replies/comments were updated
        //console.log("Resetting user unreadNotifications");
        await User.findByIdAndUpdate(userId, { $set: { unreadNotifications: 0 } });
        notificationsUpdated = true; // Consider the notifications as updated since we reset the count

        //console.log("Notifications cleared successfully.");

        res.json({ message: 'Notifications cleared' });
    } catch (error) {
        console.error("Error resetting notifications:", error);
        res.status(500).json({ message: "Failed to reset notifications", error: error.message });
    }
});

//profile pic upload
router.post('/profile/update', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    try {
        const userId = req.user.userId; // Get user ID from the JWT

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Handle profile picture upload
        if (req.file) {
            try {
                // Upload the new image to Cloudinary
                const result = await cloudinary.uploader.upload(req.file.path);
                const newProfilePictureUrl = result.secure_url;

                // Delete the old image from Cloudinary (optional - see note below)
                if (user.profilePictureUrl) {
                    // Extract the public ID from the URL
                    const publicId = user.profilePictureUrl.split('/').pop().split('.')[0]; // This might need adjustment
                    try {
                        await cloudinary.uploader.destroy(publicId);  // Delete from cloudinary
                    } catch (deleteError) {
                         console.warn('Error deleting old profile picture from Cloudinary:', deleteError);
                         // DON'T throw an error here. Log it and continue.
                    }
                }

                // Update the user's profilePictureUrl
                user.profilePictureUrl = newProfilePictureUrl;
            } catch (uploadError) {
                console.error("Cloudinary upload error:", uploadError);
                return res.status(500).json({ message: 'Profile picture upload failed', error: uploadError.message });
            }
        }

        await user.save();

        res.json({ message: 'Profile updated successfully', profilePictureUrl: user.profilePictureUrl }); // Send back the new URL
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Failed to update profile', error: error.message });
    }
});

//porfile pic fetch
router.get('/profile/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId).select('username profilePictureUrl'); // Only return username and profilePictureUrl
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Failed to fetch user profile', error: error.message });
    }
});
  
  
  module.exports = router;