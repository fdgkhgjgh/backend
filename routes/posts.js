// backend/routes/posts.js
const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Comment = require('../models/Comment'); // Import the Comment model
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const upload = require('../middleware/upload'); // Import the upload middleware
const mongoose = require('mongoose'); // Ensure Mongoose is required
const { postLimiter, commentLimiter } = require('../middleware/rateLimit'); // Import rate limiters
const authenticateToken = require('../middleware/auth');


// Get all posts (with pagination)
router.get('/', async (req, res) => {
    const { page = 1, limit = 8 } = req.query; // Default page=1, limit=8
    const parsedLimit = parseInt(limit); // Ensure limit is a number
    const parsedPage = parseInt(page);

    if (isNaN(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ message: 'Invalid limit value.  Must be a positive number.' });
    }

    if (isNaN(parsedPage) || parsedPage <= 0) {
        return res.status(400).json({ message: 'Invalid page value. Must be a positive number.' });
    }

    try {
        const skip = (parsedPage - 1) * parsedLimit; // Calculate how many posts to skip
        const posts = await Post.find()
            .sort({ pinned: -1, lastActivity: -1 })
            .populate('author', 'username')
            .skip(skip)
            .limit(parsedLimit);

        const totalPosts = await Post.countDocuments(); // Get the total number of posts
        const totalPages = Math.ceil(totalPosts / parsedLimit); // Calculate total pages

        res.json({
            posts,
            totalPages,
            currentPage: parsedPage,
            totalPosts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// --- Helper function to update total comments count on a post
async function updateTotalComments(postId) {
    try {
        const post = await Post.findById(postId);
        if (!post) {
            console.error(`Post not found with id: ${postId}`);
            return;
        }

        // Fetch all comments that are NOT replies (i.e., top-level comments)
        const topLevelComments = await Comment.find({ post: postId, parentComment: null });

        let total = topLevelComments.length;

        // Iterate through top-level comments and count their replies
        for (const comment of topLevelComments) {
            total += await Comment.countDocuments({ parentComment: comment._id });
        }

        post.totalComments = total;
        await post.save();

    } catch (error) {
        console.error("Error updating total comments count:", error);
    }
}


// Get a single post by ID, *including* its comments and replies
router.get('/:id', async (req, res) => {
    // Check if the ID is a valid ObjectId
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid post ID' });
    }

    try {
        const post = await Post.findById(req.params.id)
            .populate('author', 'username profilePictureUrl')
            .populate({
                path: 'comments',
                populate: {
                    path: 'author',
                    select: 'username profilePictureUrl'
                }
            });

        if (!post) {
            console.log(`Post with id ${req.params.id} not found`); // Log if post is not found
            return res.status(404).json({ message: 'Post not found' });
        }

        //console.log(`Post with id ${req.params.id} found:`, post); // Log the populated post

        res.json(post);  // Send back the populated post directly!
    } catch (error) {
        console.error("Error fetching post:", error); // Log any errors
        res.status(500).json({ message: error.message });
    }
});

// Create a new post (protected route)
router.post('/', authenticateToken, upload.array('files', 5), async (req, res) => {  //Use upload.array middleware.

    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ message: "Title and content are required." })
        }

        const imageUrls = [];
        const videoUrls = [];

        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (file.mimetype.startsWith('image/')) {
                    imageUrls.push(file.path);
                } else if (file.mimetype.startsWith('video/')) {
                    videoUrls.push(file.path);
                }
            });
        }

        const newPost = new Post({
            title,
            content,
            author: req.user.userId, // Use userId from the JWT payload
            imageUrls: imageUrls, // Store the array of image URLs
            videoUrls: videoUrls,  //Store the array of video URLs
        });

        const savedPost = await newPost.save();
        res.status(201).json(savedPost);
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({ message: error.message });
    }
});

// Update a post (protected route - and check ownership)
router.put('/:id', authenticateToken, upload.array('files', 5), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        //Check if post belongs to user.
        if (post.author.toString() !== req.user.userId) {
            return res.status(403).json({ message: "You are not authorized to update this post." })
        }

        post.title = req.body.title || post.title;  // Update title if provided
        post.content = req.body.content || post.content;   //Update content if provided.

        const imageUrls = [];
        const videoUrls = [];

        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (file.mimetype.startsWith('image/')) {
                    imageUrls.push(file.path);
                } else if (file.mimetype.startsWith('video/')) {
                    videoUrls.push(file.path);
                }
            });
        }

        post.imageUrls = imageUrls;
        post.videoUrls = videoUrls

        const updatedPost = await post.save();
        res.status(200).json(updatedPost);


    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

// Delete a post (protected route - and check ownership)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: "Post not found." })
        }

        //Check user ownership
        if (post.author.toString() !== req.user.userId) {
            return res.status(403).json({ message: "You don't have permission to delete this post." })
        }

        // *** NEW CODE TO UNPIN THE POST FROM THE USER'S pinnedPosts ARRAY ***
        const userId = req.user.userId;
        const user = await User.findById(userId);
        if (user) {
            user.pinnedPosts.pull(req.params.id); // Remove the post ID from the array
            await user.save();
        }

        await Post.findByIdAndDelete(req.params.id); //Or  await post.remove();
        res.status(200).json({ message: "Post deleted successfully." })

    } catch (error) {
        res.status(500).json({ message: error.message })
    }
});



// Add a comment to a post (protected route)
router.post('/:id/comments', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ message: 'Comment text is required' });
        }

        let imageUrl = undefined;
        let videoUrl = undefined;

        if (req.file) {
            if (req.file.mimetype.startsWith('image/')) {
                imageUrl = req.file.path;
            } else if (req.file.mimetype.startsWith('video/')) {
                videoUrl = req.file.path;
            } else {
                return res.status(400).json({ message: 'Invalid file type. Only images and videos are allowed.' });
            }
        }

        const newComment = new Comment({
            author: req.user.userId,
            text: text,
            imageUrl: imageUrl,
            videoUrl: videoUrl,
            post: req.params.id
        });
        await newComment.save();

        post.comments.push(newComment._id);

        // ***UPDATE LAST ACTIVITY HERE***
        post.lastActivity = Date.now();
        await post.save();

        // *** UPDATE totalComments HERE ***
        await updateTotalComments(req.params.id); // <--- ADD THIS LINE
        
        // Increment unreadNotifications for the post author (if it's not the commenter)
        if (post.author.toString() !== req.user.userId) {
            await User.findByIdAndUpdate(post.author._id, { $inc: { unreadNotifications: 1 } });
        }

        const populatedPost = await Post.findById(req.params.id)
            .populate('author', 'username')
            .populate({
                path: 'comments',
                populate: {
                    path: 'author',
                    select: 'username'
                }
            });

        res.status(201).json(populatedPost);
    } catch (error) {
        console.error("Error creating comment:", error);
        res.status(500).json({ message: error.message });
    }
});
// Add a reply to a comment (protected route)
router.post('/:postId/comments/:commentId/replies', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.postId) || !mongoose.isValidObjectId(req.params.commentId)) {
            return res.status(400).json({ message: 'Invalid post or comment ID' });
        }

        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const parentComment = await Comment.findById(req.params.commentId);
        if (!parentComment) {
            return res.status(404).json({ message: 'Parent comment not found' });
        }

        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ message: 'Reply text is required' });
        }

        const newComment = new Comment({
            author: req.user.userId,
            text: text,
            imageUrl: req.file ? req.file.path : undefined,
            post: req.params.postId,
            parentComment: req.params.commentId,
        });

        await newComment.save();

        parentComment.replies.push(newComment._id);
        await parentComment.save();

        // ***UPDATE LAST ACTIVITY HERE***
        post.lastActivity = Date.now();
        await post.save();

         // *** UPDATE totalComments HERE ***
         await updateTotalComments(req.params.postId); // <--- ADD THIS LINE
        
        // Increment notifications for both comment author AND post author
        // 1. Increment for comment author (original code)
        if (parentComment.author.toString() !== req.user.userId) {  // Make sure not to notify the user replying to themselves
            await User.findByIdAndUpdate(parentComment.author._id, { $inc: { unreadNotifications: 1 } });
        }

        // 2. Increment for post author (new code)
        if (post.author.toString() !== req.user.userId && post.author.toString() !== parentComment.author.toString()) {
            await User.findByIdAndUpdate(post.author._id, { $inc: { unreadNotifications: 1 } });
        }

        // Populate the author.
        const populatedComment = await Comment.findById(newComment._id)
            .populate('author', 'username')

        res.status(201).json(populatedComment);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get replies to a comment
router.get('/comments/:commentId/replies', async (req, res) => {
    //console.log('Fetching replies for comment:', req.params.commentId);
    try {
        // Validate commentId
        if (!mongoose.isValidObjectId(req.params.commentId)) {
            console.log('Invalid comment ID:', req.params.commentId);
            return res.status(400).json({ message: 'Invalid comment ID' });
        }

        const comment = await Comment.findById(req.params.commentId);
        if (!comment) {
            //console.log('Comment not found for ID:', req.params.commentId);
            return res.status(404).json({ message: 'Comment not found' });
        }

        // Manually populate the replies
        await comment.populate({
            path: 'replies',
            populate: {
                path: 'author',
                select: 'username profilePictureUrl'
            }
        });

        //console.log('Fetched replies:', comment.replies);
        res.json(comment.replies);
    } catch (error) {
        console.error("Error fetching replies:", error);
        res.status(500).json({ message: error.message });
    }
});

//Delete a comment of a post (protected route.)
router.delete('/:postId/comments/:commentId', authenticateToken, async(req, res) => {
    try {
         if (!mongoose.isValidObjectId(req.params.postId)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }
        const {postId, commentId} = req.params;

        const post = await Post.findById(postId);

        //Check if the post exists.
         if (!post) {
            return res.status(404).json({message: "Post not found."})
         }

          const comment = await Comment.findById(commentId);
          if (!comment) {
               return res.status(404).json({ message: 'Comment not found' });
          }

          //Check if the current user is the author the comment.
           if (comment.author.toString() !== req.user.userId) {
             return res.status(403).json({message: "You are not authorized to delete this comment."})
           }

          post.comments.pull(commentId);
          await post.save();
          await Comment.findByIdAndDelete(commentId); // And delete the comment

          // Update total comments count after deleting a comment
          await updateTotalComments(postId);


           res.status(200).json({message: "Comment deleted suceessfully."})

    } catch(error) {
        res.status(500).json({message: error.message})
    }
})

module.exports = router;

//Get user all posts.
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // Find all posts by the specified user ID
        const posts = await Post.find({ author: userId }).sort({ createdAt: -1 }).select('+upvotes +downvotes');
        res.json(posts);

    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

// Upvote a post
router.post('/:id/upvote', authenticateToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const userId = req.user.userId;

        if (post.upvotedBy.includes(userId)) {
            return res.status(400).json({ message: 'You have already upvoted this post' });
        }

        if (post.downvotedBy.includes(userId)) {
            // Remove downvote
            post.downvotedBy.pull(userId);
            post.downvotes -= 1;
        }

        post.upvotes += 1;
        post.upvotedBy.push(userId); // Add user to upvotedBy array

        await post.save();

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes });
    } catch (error) {
        console.error("Error upvoting post:", error);
        res.status(500).json({ message: error.message });
    }
});

// Downvote a post
router.post('/:id/downvote', authenticateToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const userId = req.user.userId;

        if (post.downvotedBy.includes(userId)) {
            return res.status(400).json({ message: 'You have already downvoted this post' });
        }

        if (post.upvotedBy.includes(userId)) {
            // Remove upvote
            post.upvotedBy.pull(userId);
            post.upvotes -= 1;
        }

        post.downvotes += 1;
        post.downvotedBy.push(userId); // Add user to downvotedBy array
        await post.save();

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes });
    } catch (error) {
        console.error("Error downvoting post:", error);
        res.status(500).json({ message: error.message });
    }
});

// Helper function to truncate content and title
function truncateContent(content, title) {
    const maxContentLength = 1000;
    const firstLineMaxLength = 45;
    const maxTitleLength = 45;  // Added title length restriction

    // Truncate title
    const truncatedTitle = title.length > maxTitleLength ? title.substring(0, maxTitleLength) + '...' : title;

    // Truncate content
    const lines = content.split('\n');
    const firstLine = lines[0] || '';  // Ensure first line exists
    const truncatedFirstLine = firstLine.substring(0, firstLineMaxLength);
    const remainingContent = content.substring(truncatedFirstLine.length);
    const truncatedContent = truncatedFirstLine + remainingContent.substring(0, maxContentLength - truncatedFirstLine.length);
    const finalContent = truncatedContent.length < content.length ? truncatedContent + '...' : truncatedContent;

    return {
        truncatedTitle: truncatedTitle,
        truncatedContent: finalContent
    };
}

// Pin/Unpin a post (protected route - and check ownership)
router.post('/:id/pin', authenticateToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }

        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        // Check user ownership
        if (post.author.toString() !== req.user.userId) {
            return res.status(403).json({ message: "You are not authorized to pin/unpin this post." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const MAX_PINNED_POSTS = 1; // Define the maximum number of pinned posts

        if (!post.pinned) { // Trying to PIN
            if (user.pinnedPosts.length >= MAX_PINNED_POSTS) {
                return res.status(400).json({ message: `You can only pin a maximum of ${MAX_PINNED_POSTS} posts.` });
            }

            post.pinned = true;
            user.pinnedPosts.push(post._id); // Add to pinnedPosts array

        } else { // Trying to UNPIN
            post.pinned = false;
            user.pinnedPosts.pull(post._id);  // Remove from pinnedPosts array
        }

        await post.save();
        await user.save();

        res.json({ message: `Post ${post.pinned ? 'pinned' : 'unpinned'} successfully`, pinned: post.pinned });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});