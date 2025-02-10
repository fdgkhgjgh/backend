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


// Middleware to verify JWT and protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user;  //  Attach the user object to the request
        next();
    });
};

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
            .sort({ createdAt: -1 })
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

// Get a single post by ID, *including* its comments
router.get('/:id', async (req, res) => {
    // ... ID validation ...

    const { page = 1, limit = 20 } = req.query; // Pagination parameters
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    if (isNaN(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ message: 'Invalid limit value.' });
    }

    if (isNaN(parsedPage) || parsedPage <= 0) {
        return res.status(400).json({ message: 'Invalid page value.' });
    }

    try {
        const post = await Post.findById(req.params.id)
            .populate('author', 'username')
            .populate({
                path: 'comments',
                options: {
                    skip: (parsedPage - 1) * parsedLimit, //Apply pagination.
                    limit: parsedLimit,
                    sort: { createdAt: -1 }, //Sort comments by newest first.
                },
                populate: {  //Nested populate to get comment authors
                    path: 'author',
                    select: 'username'
                }
            });

        if (!post) {
            console.log(`Post with id ${req.params.id} not found`); // Log if post is not found
            return res.status(404).json({ message: 'Post not found' });
        }

        //Also need totalComments for pagination.
        const totalComments = await Comment.countDocuments({ post: req.params.id });
        const totalPages = Math.ceil(totalComments / parsedLimit);

        console.log(`Post with id ${req.params.id} found:`, post); // Log the populated post

        res.json({
            post,
            totalPages,
            currentPage: parsedPage,
            totalComments,
        });

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
        return res.status(400).json({message: "Title and content are required."})
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


    } catch(error) {
        res.status(500).json({message: error.message})
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
        return res.status(404).json({message: "Post not found."})
      }

      //Check user ownership
    if (post.author.toString() !== req.user.userId) {
        return res.status(403).json({message: "You don't have permission to delete this post."})
    }

    await Post.findByIdAndDelete(req.params.id); //Or  await post.remove();
    res.status(200).json({message: "Post deleted successfully."})

   } catch (error) {
     res.status(500).json({message: error.message })
   }
});



// Add a comment to a post (protected route)
router.post('/:id/comments', authenticateToken, upload.single('image'), async (req, res) => { // Add upload middleware
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

       //**********************START of CHANGES here!*******************
        //Create comment first.
         const newComment = new Comment({
            author: req.user.userId,
            text: text,
            imageUrl: req.file ? req.file.path : undefined, // Store Cloudinary URL
            post: req.params.id  //Add post id,VERY IMPORTANT
        });
        await newComment.save(); //Save it before you push it.
        //**********************END of CHANGES here!*******************

        post.comments.push(newComment._id); //Push comment id.
        await post.save();

       //**********************START of CHANGES here!*******************
       //Populate the author.
        const populatedPost = await Post.findById(req.params.id)
            .populate('author', 'username')
            .populate({
                path: 'comments',
                populate: {  //Nested populate to get comment authors
                    path: 'author',
                    select: 'username'
                }
            });
        //**********************END of CHANGES here!*******************

        res.status(201).json(populatedPost);
    } catch (error) {
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
//**********************START of CHANGES here!*******************
       //Populate the author.
        const populatedComment = await Comment.findById(newComment._id)
            .populate('author', 'username')

        res.status(201).json(populatedComment);
//**********************END of CHANGES here!*******************

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get replies to a comment
router.get('/comments/:commentId/replies', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.commentId)) {
            return res.status(400).json({ message: 'Invalid comment ID' });
        }

        const comment = await Comment.findById(req.params.commentId)
            .populate({
                path: 'replies',
                populate: { // Populate author of each reply
                    path: 'author',
                    select: 'username'
                }
            });

        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

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

         //Find the comment.
         //const comment = post.comments.id(commentId);
         //Remove this line of code because u are not using anymore

         //Check if the comment exists.
          //if (!comment) {
          //  return res.status(404).json({message: "Comment not found."})
          //}
          //Remove this line of code because u are not using anymore

          const comment = await Comment.findById(commentId);
          if (!comment) {
               return res.status(404).json({ message: 'Comment not found' });
          }

          //Check if the current user is the author the comment.
           if (comment.author.toString() !== req.user.userId) {
             return res.status(403).json({message: "You are not authorized to delete this comment."})
           }

           //Remove the comment.
           //post.comments.pull({ _id: commentId }); // Use pull to remove the comment.
           //await post.save();
           //Remove this line of code

          post.comments.pull(commentId);
          await post.save();
          await Comment.findByIdAndDelete(commentId); // And delete the comment

           res.status(200).json({message: "Comment deleted suceessfully."})

    } catch(error) {
        res.status(500).json({message: error.message})
    }
})


module.exports = router;

  //Get user all posts.
router.get('/user/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
         // Check if the current user is authorized to get posts of this user
         if (req.user.userId !== userId) {
             return res.status(403).json({ message: "You are not authorized to get posts of this user." });
           }
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

        if (post.upvotedBy.includes(userId) || post.downvotedBy.includes(userId)) {
            return res.status(400).json({ message: 'You have already voted on this post' });
        }

        post.upvotes += 1;
        post.upvotedBy.push(userId); // Add user to upvotedBy array

        await post.save();

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes });
    } catch (error) {
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

         if (post.upvotedBy.includes(userId) || post.downvotedBy.includes(userId)) {
            return res.status(400).json({ message: 'You have already voted on this post' });
        }

        post.downvotes += 1;
        post.downvotedBy.push(userId); // Add user to downvotedBy array
        await post.save();

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});