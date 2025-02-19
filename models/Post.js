// backend/models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: {
         type: String,
         required: true,
         maxlength: 45 // Add the maxlength validator
     },
    content: {
         type: String,
         required: true,
         maxlength: 1000 // Add the maxlength validator
     },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrls: [{ type: String }],
    videoUrls: [{ type: String }],
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }], // Change to reference Comment model
    lastActivity: { type: Date, default: Date.now },// New field!
    pinned: { type: Boolean, default: false }, // New field!
    totalComments: { type: Number, default: 0 } // New field!
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;
