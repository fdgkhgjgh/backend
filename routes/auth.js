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
        const notifications = [];

        // 1. Find all unread replies to the user's comments
        const unreadReplyNotifications = await Comment.find({
            author: userId, // Comments authored by the user
            'replies.readBy': { $ne: userId } // Replies not read by the user
        }).populate('post');  // Populate the 'post' field to get post details

        for (const comment of unreadReplyNotifications) {
            const unreadReplies = comment.replies.filter(reply => !reply.readBy.includes(userId));  // find replies not read yet by user
            for (const reply of unreadReplies) {
                notifications.push({
                    type: 'reply',
                    message: `New reply to your comment on post "${comment.post.title}"`,
                    postId: comment.post._id,
                    commentId: comment._id, //Add the comment id.
                    replyId: reply._id,
                });
            }

             // Mark replies as read by the user.
            comment.replies.forEach(reply => {
                if (!reply.readBy.includes(userId)) {
                    reply.readBy.push(userId);
                }
            });
            await comment.save();
        }


        // 2. Find all posts where the user is the author and find new comments on those posts
        const newPostComments = await Post.find({
            author: userId,
            'comments.author': { $ne: userId }
        }).populate({
            path: 'comments',
            populate: {
                path: 'author',
                select: 'username'
            }
        }); // Find new comments

        for (const post of newPostComments) {
            const unreadComments = post.comments.filter(comment => comment.author._id.toString() !== userId);
            for (const comment of unreadComments) {
                notifications.push({
                    type: 'comment',
                    message: `New comment on your post "${post.title}"`,
                    postId: post._id,
                    commentId: comment._id,
                });
            }
        }

        // Get total unread notifications count (This may require adjustment based on the queries above)
        const user = await User.findById(userId);
        const unreadNotifications = user.unreadNotifications;


        res.json({ notifications, unreadNotifications });

    } catch (error) {
        console.error("Error fetching notifications with details:", error);
        res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
    }
});


// Reset unread notifications count (when user clicks profile)
router.post('/reset-notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(`Resetting notifications for user: ${userId}`);

        // Reset the user's unread notifications count
        console.log("Resetting user unreadNotifications");
        await User.findByIdAndUpdate(userId, { $set: { unreadNotifications: 0 } });

        // Optionally reset the 'readBy' array in Comment for replies
        // Mark all replies to the user's comments as read when profile page is visited
        await Comment.updateMany(
            { 'replies.author': userId },
            { $addToSet: { 'replies.$[].readBy': userId } }  // Ensure only unique user IDs are added to readBy array
        );

        console.log("Notifications cleared successfully.");
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