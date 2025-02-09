// backend/routes/posts.js
const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const upload = require('../middleware/upload'); // Import the upload middleware
const mongoose = require('mongoose'); // Ensure Mongoose is required

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

// Get all posts
router.get('/', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 }).populate('author', 'username').select('+upvotes +downvotes'); // Populate author's username
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get a single post by ID, *including* its comments
router.get('/:id', async (req, res) => {
    // Check if the ID is a valid ObjectId
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid post ID' });
    }

    try {
        const post = await Post.findById(req.params.id)
            .populate('author', 'username')
            .populate({
                path: 'comments.author',
                select: 'username'
            })

        if (!post) {
            console.log(`Post with id ${req.params.id} not found`); // Log if post is not found
            return res.status(404).json({ message: 'Post not found' });
        }

        // Explicitly select all the desired fields
        const selectedPost = await Post.findById(post._id)
            .select('+upvotes +downvotes +title +content +imageUrl +createdAt +author +comments');

        console.log(`Post with id ${req.params.id} found:`, selectedPost); // Log the selectedPost

        res.json(selectedPost);
    } catch (error) {
        console.error("Error fetching post:", error); // Log any errors
        res.status(500).json({ message: error.message });
    }
});

// Create a new post (protected route)
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({message: "Title and content are required."})
        }
    const newPost = new Post({
      title,
      content,
      author: req.user.userId, // Use userId from the JWT payload
      imageUrl: req.file ? req.file.path : undefined, // Cloudinary URL if file was uploaded
    });

    const savedPost = await newPost.save();
    res.status(201).json(savedPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update a post (protected route - and check ownership)
router.put('/:id', authenticateToken, upload.single('image'), async (req, res) => {
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
        if (req.file) {
            post.imageUrl = req.file.path;   //Update image if new image uploaded.
        }

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

        const newComment = {
            author: req.user.userId,
            text: text,
            imageUrl: req.file ? req.file.path : undefined, // Store Cloudinary URL
        };

        post.comments.push(newComment);
        await post.save();

        const populatedPost = await Post.findById(req.params.id)
            .populate('author', 'username')
            .populate({
                path: 'comments.author',
                select: 'username'
            });

        res.status(201).json(populatedPost);
    } catch (error) {
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
         const comment = post.comments.id(commentId);
         //Check if the comment exists.
          if (!comment) {
            return res.status(404).json({message: "Comment not found."})
          }

          //Check if the current user is the author the comment.
           if (comment.author.toString() !== req.user.userId) {
             return res.status(403).json({message: "You are not authorized to delete this comment."})
           }

           //Remove the comment.
           comment.deleteOne(); // Use deleteOne() to remove subdocument.
           await post.save();

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

        post.upvotes += 1; // Increment upvotes
        await post.save();

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes }); // Send back updated counts
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

        post.downvotes += 1; // Increment downvotes
        await post.save();

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes }); // Send back updated counts
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});