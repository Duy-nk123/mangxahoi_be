const mongoose = require('mongoose')
const Schema = mongoose.Schema

const commentSchema = new Schema({
    Content: {
        type: String,
        required: true,
    },
    LastEdition:{
        type:Date,
        required: true,
    },
    UserId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    IdeaId: {
        type: Schema.Types.ObjectId,
        ref: 'Idea'
    },
    Anonymous:{
        type:Boolean,
        required: true,
    }
})

module.exports = mongoose.model('CommentIdea',commentSchema)