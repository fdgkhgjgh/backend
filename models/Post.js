// backend/models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        maxlength: 45
    },
    content: {
        type: String,
        required: false, // 🌟 This makes the text box option completely optional
        maxlength: 1000 
    },
    author: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    imageUrls: [{ type: String }],
    videoUrls: [{ type: String }],
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }], 
    lastActivity: { type: Date, default: Date.now },
    pinned: { type: Boolean, default: false }, 
    totalComments: { type: Number, default: 0 } 
}, { timestamps: true }); // 🌟 Timestamps block now aligns perfectly!

const Post = mongoose.model('Post', postSchema);
module.exports = Post;
