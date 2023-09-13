const express = require('express')
const router = express.Router()

const multer = require('multer')
const { verifyToken, verifyRole } = require('../middleware/auth') // Middleware
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3'); // working with file in amazon
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner"); // create access url
//models
const User = require('../models/User')

// create multer storage to save file
const storage = multer.memoryStorage();
// configure multer upload to upload file
const upload = multer({ storage: storage })

//configure amazon
const s3 = new S3Client({
  region: 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});

// @route PUT api/user/updateProfile/:id
// @desc update profile
// @access Private 
router.put('/updateProfile/:id',verifyToken, upload.single('Avatar'), async (req, res) => {
  
  const { Name, Gender, PhoneNumber, DoB, Email, Department } = req.body
  try {
    const profileUpdateCondition = { _id: req.params.id }
    // get profile
    const currentProfile = await User.findOne({ profileUpdateCondition })
    //validation not found
    if (!currentProfile) return res.status(400).json({ success: false, message: "Account is not found" })
    const file = req.file;
    let newProfileInformation = null
    // if not file
    if (!file) {
      newProfileInformation = { Name: Name, Gender: Gender, DoB: DoB, PhoneNumber: PhoneNumber, Email: Email, Department: Department }
    }
    else {
      // upload file to amazon
      const params = {
        Bucket: 'webep',
        Key: `Avatar/${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        Expires: new Date('2026-01-01T00:00:00Z'),
      };
      const cm = new PutObjectCommand(params);
      const data = await s3.send(cm);
      const command = new GetObjectCommand(params); // get file uploaded
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 }); // create access url
      // create profile
      newProfileInformation = { Name: Name, Gender: Gender, DoB: DoB, PhoneNumber: PhoneNumber, Email: Email, Department: Department, Avatar: `${signedUrl}` }
    }
    // update profile
    const updatedProfile = await User.findOneAndUpdate(profileUpdateCondition, newProfileInformation, { new: true })

    if (!updatedProfile) return res.status(403).json({ success: false, message: 'Profile not found or user not authorised' })

    res.status(200).json({ success: true, message: 'Excellent progress!', updatedProfile })
  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
