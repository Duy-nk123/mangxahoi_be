const mongoose = require('mongoose')
const Schema = mongoose.Schema

const CategorySchema = new Schema({
    Title: {
        type: String,
        required: true,
    },
    Description: {
        type: String
    },
    DateInnitiated: {
        type: Date,
        required: true,
    },
    Status: {
        type: String,
        required: true,
        enum: ['Opening','Closed']
    }
})

module.exports = mongoose.model('Category',CategorySchema)