// backend/models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrls: [{ type: String }],
    videoUrls: [{ type: String }],
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }], // Change to reference Comment model
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;
