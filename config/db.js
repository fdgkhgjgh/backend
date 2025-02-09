// backend/config/db.js
const mongoose = require('mongoose');

mongoose.set('debug', true);
const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1); // Exit process on connection failure
  }
};

module.exports = { connect };
