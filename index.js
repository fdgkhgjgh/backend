// backend/index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS Configuration ---
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Use environment variable for flexibility
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
    credentials: true, // Important for cookies/auth headers with HTTPS
};

app.use(cors(corsOptions)); // Use the configured options
// --- END CORS ---

// Middleware
// Remove this line: app.use(cors());  //No need old cors
app.use(express.json()); // Parse JSON request bodies

// Database connection (using config/db.js - see next)
const db = require('./config/db');
db.connect();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// Error Handling (basic)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`); // Corrected template literal
});