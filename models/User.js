// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Add other fields as needed (e.g., email, profile picture URL)
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

// New method to update notification count
userSchema.methods.updateNotificationCount = async function() {
  // Count posts with at least one comment
  const postsWithResponses = await mongoose.model('Post').countDocuments({ author: this._id, comments: { $exists: true, $ne: [] } });
  // Count comments with at least one reply
  const commentsWithReplies = await mongoose.model('Comment').countDocuments({ author: this._id, replies: { $exists: true, $ne: [] } });
  // Update notificationCount
  this.notificationCount = postsWithResponses + commentsWithReplies;
  await this.save();
};

const User = mongoose.model('User', userSchema);
module.exports = User;
