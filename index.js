//import library
const express = require('express');
require('dotenv').config();
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');                                   
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");  
const clear = require('clear-terminal')

//import routes
const authRouter = require('./routes/auth');
const ideaRouter = require('./routes/idea');
const cateRouter = require('./routes/category');
const fileRouter = require('./routes/file');
const userRouter = require('./routes/user');
const dashboard = require('./routes/dashboard')
const academic = require('./routes/academic');
const realtime = require('./routes/realtime.js');

//import model using in index
const User = require('./models/User')
const File = require('./models/File')


// connect mongo atlas
const connectDB = async () => {
  try {
    await mongoose.connect(`mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@clusterwebenterprisepro.9brgsqy.mongodb.net/?retryWrites=true&w=majority`);
    console.log('Database is connected');
  } catch (error) {
    console.log('Connecting to DB is failed');
    console.log(error.message);
    process.exit(1);
  }
};

connectDB();

const app = express();
app.use(express.json()); // use json
app.use(cors());         // allow server access request

const defaultAvatar  = 'https://i.stack.imgur.com/l60Hf.png'
// set authentication and get Object for aws service
const s3 = new S3Client({
  region: 'ap-southeast-1',
  credentials: {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});
//function to update public url for avatar in aws
const runAvatarUpdate = async () => {
  const oldAvatar = await User.find();
  let params = ''
  let command = ''
  let signedUrl = ''
  for (let user of oldAvatar) {
    if(user.Avatar != defaultAvatar){
      user.Avatar = user.Avatar.split('?')[0].slice(53);
    params = { Bucket: 'webep', Key: `Avatar/${user.Avatar}` };
    command = new GetObjectCommand(params);
    try {
      signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
      user.Avatar = signedUrl;
      await user.save();
    } catch (err) {
      console.log(err);
    }
    }
  }
}
//function to update public url for file in aws
const runFileUpdate = async () => {
  const oldFile = await File.find();
  let params = ''
  let command = ''
  let signedUrl = ''
  for (let file of oldFile) {
    file.Link = file.Link.split('?')[0].slice(54);
    params = { Bucket: 'webep', Key: `uploads/${file.Link}` };
    command = new GetObjectCommand(params);
    try {
      signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
      file.Link = signedUrl;
      await file.save();
    } catch (err) {
      console.log(err);
    }
  }
}

// run after server run
runAvatarUpdate();
runFileUpdate();

// Daily each 6 days to update url images,files (security)
cron.schedule('0 0 */6 * *', async () => {
  runAvatarUpdate();
  runFileUpdate();
  clear()
}, {
  scheduled: true,
  timezone: "Asia/Ho_Chi_Minh"
});

// set route
clear()
app.use('/api/auth', authRouter);
app.use('/api/idea', ideaRouter);
app.use('/api/category', cateRouter);
app.use('/api/file', fileRouter);
app.use('/api/user', userRouter);
app.use('/api/dashboard', dashboard);
app.use('/api/event', academic);

//set port
const port = process.env.PORT || 5000;
//run server with port
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

realtime(server);