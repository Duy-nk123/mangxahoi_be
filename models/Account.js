const mongoose = require('mongoose')
const Schema = mongoose.Schema

const AccountSchema = new Schema({
    Username: {
        type: String,
        required:true,
        unique:true
    },
    Password: {
        type: String,
        required:true
    },
    Role: {
        type: String,
        required: true,
        enum: ['Administrator','QAM','QAC','Staff']
    },
    Active:{
        type:Boolean,
        required:true
    }
})

module.exports = mongoose.model('Account',AccountSchema)
