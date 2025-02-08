// backend/models/Post.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
}, { timestamps: true });


const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String },
    comments: [commentSchema] // Add the comments array, using the commentSchema
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;