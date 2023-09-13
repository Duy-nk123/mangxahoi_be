const mongoose = require('mongoose')
const Schema = mongoose.Schema

const FileSchema = new Schema({
    Link: {
        type: String,
        required: true,
    },
    DateUpload: {
        type: Date,
        required: true,
    },
    IdeaId: {
        type: Schema.Types.ObjectId,
        ref: 'Idea'
    }
})

module.exports = mongoose.model('File',FileSchema)