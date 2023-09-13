const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  ideaId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Idea'
  },
  state: {
    type: String,
    enum: ['like', 'dislike','view'],
    required: true
  },
  createAt:{
    type:Date,
    required: true,
  }
});

module.exports = mongoose.model('State', stateSchema);
