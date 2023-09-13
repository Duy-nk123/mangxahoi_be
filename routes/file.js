const express = require('express')
const router = express.Router()

const AWS = require('@aws-sdk/client-s3'); //working with file (upload,access)
const fsx = require('fs-extra');           //working with file csv
const archiver = require('archiver');           // zip file

const createCsvWriter = require('csv-writer').createObjectCsvWriter; //write file
const { verifyTokenFromQueryString,verifyToken, verifyRole } = require('../middleware/auth') // Middleware
//models
const Idea = require('../models/Idea')
const File = require('../models/File')
const path = require('path');
const Academic = require('../models/Academic')

// @route GET api/file/download
// @desc download file csv
// @access Private qam
router.get('/download',verifyTokenFromQueryString, async (req, res) => {
  // check denided
  if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

  //get event
  try {
    const year = await Academic.find({ AcademicYear: new Date().getFullYear() })
    if (year[0].LastClosureDate <= new Date()) { // check LastClosureDate
      // join where UserId, CategoryId
      await Idea.find({ AcademicYear: new Date().getFullYear() })
        .populate('UserId', 'Name')
        .populate('CategoryId', 'Title')
        .exec((err, ideas) => {
          if (err) {
            console.error(err);
            res.status(500).send('Internal server error');
            return;
          }
          // check if have file csv => delete
          if (fsx.existsSync('ideas.csv')) {
            fsx.removeSync('ideas.csv');
          }
          // write header
          const newCsvWriter = createCsvWriter({
            path: 'ideas.csv',
            header: [
              { id: 'Title', title: 'Title' },
              { id: 'Description', title: 'Description' },
              { id: 'LastEdition', title: 'LastEdition' },
              { id: 'UserId', title: 'User' },
              { id: 'CategoryId', title: 'Category' },
              { id: 'Url', title: 'Url' },
            ]
          });
          // write body
          newCsvWriter.writeRecords(ideas.map(idea => {
            return {
              Title: idea.Title,
              Description: idea.Description,
              LastEdition: idea.LastEdition,
              UserId: idea.UserId.Name,
              CategoryId: idea.CategoryId?.Title,
              Url: idea.Url,
            };
          })).then(() => {
            // download
            res.download('ideas.csv');

          });
        });
    }
    else {
      res.status(400).json({ 'success': false, 'message': 'Not finish last closure date' })
    }
  }
  catch (error) {
    console.log(error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }

});

// working with amazon
const s3 = new AWS.S3({
  region: 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});

// @route GET api/file/downloadzip
// @desc download zip
// @access Private qam
router.get('/downloadzip',verifyTokenFromQueryString, async (req, res) => {
  try {
    // check denided
    if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
    const bucketName = 'webep' //bucket name in amazon
    const objects = await s3.listObjects({ Bucket: bucketName, Prefix: 'uploads/' }); // get list object
    const keys = objects.Contents.map((object) => object.Key); //get filename

    //configure zip
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    const getObjectPromises = keys.map(async (key) => {
      const object = await s3.getObject({ Bucket: bucketName, Key: key });
      archive.append(object.Body, { name: key }); // Adds the object to the archive with its key as the filename.
    });

    await Promise.all(getObjectPromises);
    res.attachment('allFile.zip');
    archive.pipe(res); // Pipes the archive to the response object.

    archive.on('end', () => {
      console.log('Archive download complete.');
    });

    archive.on('error', (err) => {
      console.error('Archive download error:', err);
      res.status(500).json({ success: false, message: 'Error downloading archive.' });
    });

    archive.finalize(); // Finalizes the archive.
  } catch (err) {
    console.error('Error downloading objects:', err);
    res.status(500).json({ success: false, message: 'Error downloading objects.' });
  }
});

// @route GET api/file/idea/downloadzip/:id
// @desc download all file to zip of each idea
// @access Private Staff
router.get('/idea/downloadzip/:id',verifyTokenFromQueryString, async (req, res) => {
  try {
    // check denided
    if(!verifyRole("Staff",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

    const files = await File.find({ IdeaId: req.params.id }) // get list file of this idea
    const filenames = files.map((file) => file.Link.split('?')[0].slice('54')) // get file name

    const bucketName = 'webep' // bucket name in amazon
    const objects = await s3.listObjects({ Bucket: bucketName, Prefix: 'uploads' }); // list file in bucket and folder uploads
    const keys = objects.Contents
      .map((object) => {
        const filename = path.basename(object.Key); // get basename
        // if have file in amazon => return this file
        if (filenames.includes(filename)) {
          return object.Key;
        } else {
          return undefined;
        }
      })
      .filter((key) => key !== undefined);
    console.log(keys)
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    // append to archive
    const getObjectPromises = keys.map(async (key) => {
      const object = await s3.getObject({ Bucket: bucketName, Key: key });
      archive.append(object.Body, { name: key }); // Adds the object to the archive with its key as the filename.
    });

    // download
    await Promise.all(getObjectPromises);
    res.attachment('File.zip');
    archive.pipe(res); // Pipes the archive to the response object.

    archive.on('end', () => {
      console.log('Archive download complete.');
    });

    archive.on('error', (err) => {
      console.error('Archive download error:', err);
      res.status(500).json({ success: false, message: 'Error downloading archive.' })
    });

    archive.finalize(); // Finalizes the archive.
  } catch (err) {
    console.error('Error downloading objects:', err);
    res.status(500).json({ success: false, message: 'Error downloading objects.' });
  }
});

module.exports = router