const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    imageUrl: { type: String },
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }], // **ADD THIS LINE**
}, { timestamps: true });

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
    comments: [commentSchema], // <--- ADD THIS LINE! This is the key fix!
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;