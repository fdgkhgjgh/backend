// backend/index.js
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
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

app.set('socketio', io);
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 10000;

// --- CORS Configuration ---
const corsOptions = {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://money666.us.kg', 'https://frontend-dke.pages.dev'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions)); // Use the configured options
// --- END CORS ---

// Middleware
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
    console.log(`Server is running on port ${PORT}`);
});