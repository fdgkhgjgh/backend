// backend/models/Comment.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    imageUrls: [{ type: String }],
    videoUrls: [{ type: String }],
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true }, // Add post reference
    parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, //For replies
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }], // Add this line
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' , default: []}], // Add this line
}, { timestamps: true });

const Comment = mongoose.model('Comment', commentSchema);
module.exports = Comment;