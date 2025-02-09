// backend/models/Post.js
const mongoose = require('mongoose');
const commentSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    imageUrl: { type: String }, // ADD THIS
}, { timestamps: true });


const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String },
    upvotes: { type: Number, default: 0 },  // Add this
    downvotes: { type: Number, default: 0 }, // Add this
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;