const express = require('express');
const mongoose = require('mongoose');
const router = express.Router()

const { sendEmail } = require('../services/email');//send mail

//models
const Comment = require('../models/CommentIdea')
const Idea = require('../models/Idea')
const User = require('../models/User')
const socket = require('socket.io');
const State = require('../models/State');

const ObjectId = mongoose.Types.ObjectId


// send mail function
async function sendTestEmail(mail, userComment, newComment) {
  await sendEmail(mail, '' + userComment + ' uploaded 1 new comment\n', 'Content is: ' + newComment.Content);
}
module.exports = function (server) {

  const io = socket(server, {
    cors: { origin: 'https://web-enterprise-project.netlify.app/' } //allow access
  })

  io.on('connection', (socket) => {
    // get like data
    async function getLike(ideaId) {
      const likef = await State.aggregate([
        {
          $match: { state: 'like', ideaId: ObjectId(ideaId) },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            count: 1,
          },
        },
      ]);
      // call socket in client
      io.emit('like', likef, ideaId);
    }
    // get dislike data
    async function getDislike(ideaId) {
      const dislikef = await State.aggregate([
        {
          $match: { state: 'dislike', ideaId: ObjectId(ideaId) },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            count: 1,
          },
        },
      ]);
      // call socket in client
      io.emit('dislike', dislikef, ideaId);
    }
    // get view data
    async function getView(ideaId) {
      const viewf = await State.aggregate([
        {
          $match: { state: 'view', ideaId: ObjectId(ideaId) },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            count: 1,
          },
        },
      ]);
      // call socket in client
      io.emit('view', viewf, ideaId);
    }
    // listen notification and change 
    socket.on('notification', async (department) => {
      const ideas = await Idea.aggregate([
        {
          $match: {
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'UserId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            _id: 1,
            Title: 1,
            LastEdition: 1,
            Url: 1,
            User: {
              $map: {
                input: '$user',
                as: 'user',
                in: {
                  name: '$$user.Name',
                  avatar: '$$user.Avatar',
                  department:'$$user.Department'
                }
              }
            }
          }
        }, {
          $sort: {
            LastEdition: -1
          }
        }
      ])
      let ideaDeparment = []
      ideas.map((idea) => {
        idea.User = idea.User.pop()
        if(idea.User.department === department) ideaDeparment.push(idea)
      })
      // call socket in client
      io.emit('notification', ideas)//data to qam
      io.emit('notificationdepartment',ideaDeparment)//data to qac
    })
    // listen like or unlike
    socket.on('like', async (data) => {
      const { userId, ideaId, state } = data;
      const validView = await State.findOne({ userId, ideaId, state: 'view' });
      const validLike = await State.findOne({ userId, ideaId, state: 'like' });
      const validDisLike = await State.findOne({ userId, ideaId, state: 'dislike' });
      if (!validView && !validLike && !validDisLike) { // if not view 
        /*not like not dislike */
        const newState = new State({ userId, ideaId, state, createAt: new Date() }); // create like 
        await newState.save();
        const newStateV = new State({ userId, ideaId, state: 'view', createAt: new Date() }); // create view
        await newStateV.save();
      }
      else if (!validLike && !validDisLike) { // if not like or dislike
        // not like, dislike
        const newState = new State({ userId, ideaId, state, createAt: new Date() }); // create like
        await newState.save();
      }
      else if (validDisLike) { // if have dislike
        //not like
        await validDisLike.remove(); // remove dislike
        const newState = new State({ userId, ideaId, state, createAt: new Date() }); // create like
        await newState.save();
      }
      else if (validLike) { // if have like = unlike
        /*not dislike */
        await validLike.remove(); // remove like
      }
      try {
        // get data
        getLike(ideaId);
        getDislike(ideaId);
        getView(ideaId)
      } catch (error) {
        console.error(`Failed to save new state: ${error}`);
      }
    });
    socket.on('dislike', async (data) => {
      const { userId, ideaId, state } = data;
      const validView = await State.findOne({ userId, ideaId, state: 'view' });
      const validLike = await State.findOne({ userId, ideaId, state: 'like' });
      const validDisLike = await State.findOne({ userId, ideaId, state: 'dislike' });
      if (!validView && !validLike && !validDisLike) {
        /*not like not dislike */
        const newState = new State({ userId, ideaId, state, createAt: new Date() }); // create dislike
        await newState.save();
        const newStateV = new State({ userId, ideaId, state: 'view', createAt: new Date() }); // create view
        await newStateV.save();
      }
      else if (!validLike && !validDisLike) {
        // not like, dislike
        const newState = new State({ userId, ideaId, state, createAt: new Date() }); // create dislike
        await newState.save();
      }
      else if (validLike) {
        //not like
        await validLike.remove(); // remove like
        const newState = new State({ userId, ideaId, state, createAt: new Date() }); // create dislike
        await newState.save();
      }
      else if (validDisLike) {
        /*not dislike */
        await validDisLike.remove(); // remove dislike
      }
      try {
        // get data
        getDislike(ideaId);
        getLike(ideaId);
        getView(ideaId)

      } catch (error) {
        console.error(`Failed to save new state: ${error}`);
      }
    });
    // listen view 
    socket.on('view', async (data) => {
      const { userId, ideaId, state } = data;
      const valid = await State.findOne({ userId: userId, ideaId: ideaId, state: 'view' });

      if (!valid) {
        const newState = new State({ userId: userId, ideaId: ideaId, state: 'view', createAt: new Date() }); // create view
        await newState.save();
      }
      try {
        // get data
        getView(ideaId)
        getLike(ideaId);
        getDislike(ideaId);

      } catch (error) {
        console.error(`Failed to save new state: ${error}`);
      }
    });
    // listen add comment
    socket.on('addComment', async (data) => {
      const { Content, UserId, IdeaId, Anonymous } = data;
      // validation content require
      if (!Content) return res.status(400).json({ success: false, message: 'Content is required!' })

      try {
        // create new Comment object
        const newComment = new Comment({
          Content,
          UserId,
          IdeaId,
          Anonymous,
          LastEdition: new Date()
        })

        await newComment.save()
        // get index of this idea  
        const ideas = await Idea.find().sort({ LastEdition: -1 });
        let z = -1;
        let i = 0
        ideas.map((idea) => {
          if (idea._id == ObjectId(IdeaId) || idea._id == IdeaId) {
            z = i
          }
          else {
            i++
          }
        })
        // call client
        io.emit('addCmt', IdeaId, z)
        /*get email of user post */
        const user = await User.aggregate([
          {
            $lookup:{
              from: 'ideas',
              localField: '_id',
              foreignField: 'UserId',
              as: 'idea'
            }
          },
          {
            $match:{
              'idea._id':ObjectId(IdeaId)
            }
          },{
            $project:{
              _id:0,
              Email:1,
            }
          }
        ])
        /*get user comment name */
        const userComment = await User.findOne({ _id: UserId })
        /*send mail to user post about new comment */
        user.map((user)=>{
          console.log(user.Email)
          sendTestEmail(user.Email, userComment.Name, newComment)
        })
      } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
      }
    });
    // listen updateComment
    socket.on('updateComment', async (data) => {
      const { commentId, Content, isAnonymous, IdeaId } = data;
      // find this comment 
      const valid = await Comment.findOne({ _id: commentId });
      // validation content require
      if (!Content) {
        io.emit('error', 'Content is required!')
      }
      // validation not found
      if (!valid) {
        io.emit('error', 'Updating is invalid')
      }
      try {
        let updatedComment = {
          Content,
          Anonymous: isAnonymous
        }

        const commentUpdateCondition = { _id: commentId }

        updatedComment = await Comment.findOneAndUpdate(
          commentUpdateCondition,
          updatedComment,
          { new: true }
        )

        // User not authorised to update post or post not found
        if (!updatedComment) {
          io.emit('error', 'Please try again')
        }
        else {
          // get index of idea in list
          const ideas = await Idea.find().sort({ LastEdition: -1 });
          let z = -1;
          let i = 0
          ideas.map((idea) => {
            if (idea._id == ObjectId(IdeaId) || idea._id == IdeaId) {
              z = i
            }
            else {
              i++
            }
          })
          let IdeaIndex = z
          io.emit('updateComment', IdeaId, IdeaIndex)
        }
      } catch (error) {
        console.log(error)
        io.emit('error', 'Please try again')
      }
    });
    //listen delete comment
    socket.on('deleteComment', async (data) => {
      const { commentId, IdeaId } = data;
      const valid = await Comment.findOne({ _id: commentId });
      // validation not found
      if (!valid) {
        io.emit('error', 'Comment not found')
      }
      try {
        // find index of idea
        const ideas = await Idea.find().sort({ LastEdition: -1 });
        let z = -1;
        let i = 0
        ideas.map((idea) => {
          if (idea._id == ObjectId(IdeaId) || idea._id == IdeaId) {
            z = i
          }
          else {
            i++
          }
        })
        const commentDeleteCondition = { _id: commentId }
        await Comment.findOneAndDelete(commentDeleteCondition) // delete comment
        io.emit('deleteComment', IdeaId, z)
      } catch (error) {
        console.error(`Failed to save new state: ${error}`);
      }
    });
    socket.on('disconnect', () => {
    });
  });
  return io;
}