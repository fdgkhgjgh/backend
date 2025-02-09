const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    imageUrl: { type: String }, // ADD THIS
}, { timestamps: true });  //Or just keep `createdAt` as before.

const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrls: [{ type: String }], // Array of image URLs  <----ADD THIS!
    videoUrls: [{ type: String }],  //Array of video URLs  <----ADD THIS!
    upvotes: { type: Number, default: 0 },  // Add this
    downvotes: { type: Number, default: 0 }, // Add this
    comments: [commentSchema], // <--- ADD THIS LINE! This is the key fix!
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;