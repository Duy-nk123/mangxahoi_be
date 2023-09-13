const mongoose = require('mongoose')
const Schema = mongoose.Schema

const IdeaSchema = new Schema({
    Title: {
        type: String,
        required: true
    },
    Description: {
        type: String
    },
    LastEdition: {
        type: Date,
        required: true,
    },
    UserId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    CategoryId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Category'
    },
    AcademicYear: {
        type: String,
        ref: 'Academic',
        required: true,
        select: 'Year'
    },
    Url:{
        type:String,
        required: true,
    },
    Anonymous:{
        type:Boolean,
        required: true,
    }
})

module.exports = mongoose.model('Idea',IdeaSchema)