// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
        res.status(200).json({ message: 'Login successful', token, userId: user._id });

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
  
  
  module.exports = router;