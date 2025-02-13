// Load environment variables
require('dotenv').config();

// Import necessary modules
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 10000;

// --- CORS Configuration ---
const corsOptions = {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://money666.us.kg', 'https://frontend-dke.pages.dev'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions)); // Use the configured CORS options

// Middleware
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database connection
const db = require('./config/db');
db.connect();

// Import routes
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// --- WebSockets Setup ---
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app); // ✅ Now app is already defined!
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('join', (userId) => {
        socket.join(userId); // Each user joins their own room
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Store socket.io instance in app
app.set('socketio', io);

// Error Handling (basic)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
server.listen(PORT, () => { // ✅ Use `server.listen` instead of `app.listen`
    console.log(`Server is running on port ${PORT}`);
});