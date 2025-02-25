// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePictureUrl: { type: String, default: null },
  unreadNotifications: { type: Number, default: 0 }, // New field for unread responses
  pinnedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: [] }] // New field!
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10); // Salt rounds: 10
  }
  next();
});

// Method to compare passwords (for login)
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};


const User = mongoose.model('User', userSchema);
module.exports = User;
