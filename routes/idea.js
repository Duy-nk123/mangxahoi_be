const express = require('express')
const mongoose = require("mongoose")
const router = express.Router()

const multer = require('multer') // upload file
const path = require('path')   // get path

const { sendEmail } = require('../services/email')  // send mail 
const { verifyToken, verifyRole } = require('../middleware/auth') // Middleware
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');//put and get file in amazon
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner"); // creat access url
// models
const Category = require('../models/Category')
const Idea = require('../models/Idea')
const File = require('../models/File')
const state = require('../models/State')
const Academic = require('../models/Academic')
const Comment = require("../models/CommentIdea")
const User = require("../models/User")

const ObjectId = mongoose.Types.ObjectId

// create multer storage to save file
const storage = multer.memoryStorage();

// configure multer upload to upload file
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // format: valid file
        const filetypes = /doc|docs|pdf|csv|rar|xlsx|xls|ppt/
        const mimetype = filetypes.test(file.mimetype)
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase())
        if (mimetype && extname) {
            return cb(null, true)
        } else {
            cb('Error: Invalid format of file')
        }
    }
})

// configure to access amazon
const s3 = new S3Client({
    region: 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
});
// @route POST api/idea/createIdea
// @desc create idea 
// @access Private Staff
router.post('/createIdea',verifyToken, upload.array('documents', 10), async (req, res) => {
    // check denided
    if(!verifyRole("Staff",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

    const files = req.files;
    const { Title, Description, UserId, CategoryId, Anonymous, AcademicYear } = req.body
    // get event
    const ClosureDate = await Academic.findOne({ AcademicYear: new Date().getFullYear() })
    // check first deadline
    if (ClosureDate.FirstClosureDate <= new Date()) {
        return res.status(400).json({ success: false, message: "Posting has expired" })
    }
    // validation required
    if (!Title) return res.status(400).json({ success: false, message: 'Title is required!' })
    try {
        //create new Idea object
        const newIdea = new Idea({
            Title,
            Description,
            LastEdition: new Date(),
            UserId: UserId,
            CategoryId: CategoryId,
            Anonymous,
            AcademicYear: AcademicYear
        })
        // update url of idea
        const url = newIdea
        newIdea.Url = 'https://server-enterprise.onrender.com/api/idea/singleidea/' + url._id + ''
        const IdeaId = await newIdea.save()

        if (files) {
            const newFiles = [];
            for (const file of files) {
                // creat object and put to amazon
                const params = {
                    Bucket: 'webep',
                    Key: `uploads/${file.originalname}`,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                    Expires: new Date('2026-01-01T00:00:00Z'),
                };
                const cm = new PutObjectCommand(params);
                try {
                    await s3.send(cm);
                    const command = new GetObjectCommand(params); // get this file 
                    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });// create access url (access 7 days)
                    // save url
                    const newFile = new File({
                        IdeaId: IdeaId,
                        DateUpload: new Date(),
                        Link: `${signedUrl}`
                    });
                    newFiles.push(newFile);
                } catch (err) {
                    console.log(err);
                }
            }
            await File.insertMany(newFiles);
        }


        const userPost = await User.findOne({ _id: UserId }) // get user post
        const QAC = await User.aggregate([  // get all qac Account at this user post's department
            {
                $lookup: {
                    from: 'accounts',
                    localField: 'AccountId',
                    foreignField: '_id',
                    as: 'accounts'
                }
            }, {
                $match: {
                    'accounts.Role': 'QAC',
                    Department: userPost.Department
                }
            }
        ])

        QAC.map((user) => {
            sendTestEmail(user.Email, userPost.Name, newIdea); // send mail
        })
        // get new idea with full related information 
        const sidea = await Idea.aggregate([
            {
                $match: {
                    _id: ObjectId(newIdea._id)
                }
            },
            {
                $lookup: {
                    from: "commentideas",
                    localField: "_id",
                    foreignField: "IdeaId",
                    as: "comments"
                }
            },
            {
                $lookup: {
                    from: "academics",
                    localField: "AcademicYear",
                    foreignField: "Year",
                    as: "academic"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "comments.UserId",
                    foreignField: "_id",
                    as: "commentUsers"
                }
            },
            {
                $lookup: {
                    from: "files",
                    localField: "_id",
                    foreignField: "IdeaId",
                    as: "files"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "UserId",
                    foreignField: "_id",
                    as: "users"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "CategoryId",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $lookup: {
                    from: "states",
                    let: { ideaId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$$ideaId", "$ideaId"] },
                                $or: [{ state: "like" }, { state: "dislike" }, { state: "view" }]
                            }
                        },
                        {
                            $group: {
                                _id: "$state",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    as: "stateCounts"
                }
            },
            {
                $addFields: {
                    viewCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "view"] }
                                    }
                                },
                                as: "viewCount",
                                in: "$$viewCount.count"
                            }
                        }
                    },
                    likeCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "like"] }
                                    }
                                },
                                as: "likeCount",
                                in: "$$likeCount.count"
                            }
                        }
                    },
                    dislikeCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "dislike"] }
                                    }
                                },
                                as: "dislikeCount",
                                in: "$$dislikeCount.count"
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    Title: 1,
                    Description: 1,
                    LastEdition: 1,
                    Anonymous: 1,
                    AcademicYear: 1,
                    FirstClosureDate: "$academic.FirstClosureDate",
                    LastClosureDate: "$academic.LastClosureDate",
                    userPost: {
                        $map: {
                            input: "$users",
                            as: "user",
                            in: {
                                _id: "$$user._id",
                                Name: "$$user.Name",
                                Avatar: "$$user.Avatar",
                            }
                        }
                    },
                    totallike: "$likeCount",
                    totaldislike: "$dislikeCount",
                    totalview: "$viewCount",
                    category: {
                        $map: {
                            input: "$category",
                            as: "category",
                            in: {
                                _id: "$$category._id",
                                Name: "$$category.Title"
                            }
                        }
                    },
                    files: {
                        $map: {
                            input: "$files",
                            as: "file",
                            in: {
                                Url: "$$file.Link"
                            }
                        }
                    }
                    ,
                    comments: {
                        $map: {
                            input: "$comments",
                            as: "comment",
                            in: {
                                _id: "$$comment._id",
                                Content: "$$comment.Content",
                                LastEdition: "$$comment.LastEdition",
                                Anonymous: '$$comment.Anonymous',
                                usercomment: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$commentUsers",
                                                        as: "u",
                                                        cond: { $eq: ["$$u._id", "$$comment.UserId"] }
                                                    }
                                                },
                                                as: "u",
                                                in: {
                                                    _id: "$$u._id",
                                                    Name: "$$u.Name",
                                                    Avatar: "$$u.Avatar"
                                                }
                                            }
                                        },
                                        0
                                    ]
                                },
                            }
                        }
                    },
                }
            }
        ])
        // convert to object
        const idea = sidea.pop()
        idea.userPost = idea.userPost.pop()
        idea.category = idea.category.pop()
        res.status(200).json({ success: true, message: 'Successfully', idea })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// function send mail
async function sendTestEmail(mail, userPost, newIdea) {
    await sendEmail(mail, '' + userPost + ' upload 1 new idea\n', 'Title is: ' + newIdea.Title + ' and content is: ' + newIdea.Description);
}

// @route GET api/idea/singleidea/:id
// @desc get idea (_id)
// @access Private 
router.get('/singleidea/:id',verifyToken, async (req, res) => {
    try {
        // get idea = _id
        const singleidea = await Idea.findOne({ _id: req.params.id })
        if (singleidea) return res.status(200).json({ success: true, singleidea })
        else return res.status(404).json({ success: false, message: 'Page not found' })
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route GET api/idea/personalpage/:id
// @desc get information of personal page
// @access Private Staff
router.get('/personalpage/:id',verifyToken, async (req, res) => {
    try {
        // check denided
        if(!verifyRole("Staff",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
        // get owner idea
        const ideas = await Idea.aggregate([
            {
                $match: {
                    'UserId': ObjectId(req.params.id),
                }
            },
            {
                $lookup: {
                    from: "commentideas",
                    localField: "_id",
                    foreignField: "IdeaId",
                    as: "comments"
                }
            },
            {
                $lookup: {
                    from: "academics",
                    localField: "AcademicYear",
                    foreignField: "Year",
                    as: "academic"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "comments.UserId",
                    foreignField: "_id",
                    as: "commentUsers"
                }
            },
            {
                $lookup: {
                    from: "files",
                    localField: "_id",
                    foreignField: "IdeaId",
                    as: "files"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "UserId",
                    foreignField: "_id",
                    as: "users"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "CategoryId",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $lookup: {
                    from: "states",
                    let: { ideaId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$$ideaId", "$ideaId"] },
                                $or: [{ state: "like" }, { state: "dislike" }, { state: "view" }]
                            }
                        },
                        {
                            $group: {
                                _id: "$state",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    as: "stateCounts"
                }
            },
            {
                $addFields: {
                    viewCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "view"] }
                                    }
                                },
                                as: "viewCount",
                                in: "$$viewCount.count"
                            }
                        }
                    },
                    likeCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "like"] }
                                    }
                                },
                                as: "likeCount",
                                in: "$$likeCount.count"
                            }
                        }
                    },
                    dislikeCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "dislike"] }
                                    }
                                },
                                as: "dislikeCount",
                                in: "$$dislikeCount.count"
                            }
                        }
                    }
                }
            },
            {
                $sort: {
                    LastEdition: -1
                }
            },
            {
                $project: {
                    _id: 1,
                    Title: 1,
                    Description: 1,
                    LastEdition: 1,
                    Url: 1,
                    AcademicYear: 1,
                    FirstClosureDate: "$academic.FirstClosureDate",
                    LastClosureDate: "$academic.LastClosureDate",
                    userPost: {
                        $map: {
                            input: "$users",
                            as: "user",
                            in: {
                                _id: "$$user._id",
                                Name: "$$user.Name",
                                Avatar: "$$user.Avatar",
                            }
                        }
                    },
                    totallike: "$likeCount",
                    totaldislike: "$dislikeCount",
                    totalview: "$viewCount",
                    category: {
                        $map: {
                            input: "$category",
                            as: "category",
                            in: {
                                _id: "$$category._id",
                                Name: "$$category.Title"
                            }
                        }
                    },
                    files: {
                        $map: {
                            input: "$files",
                            as: "file",
                            in: {
                                Url: "$$file.Link"
                            }
                        }
                    }
                    ,
                    comments: {
                        $map: {
                            input: "$comments",
                            as: "comment",
                            in: {
                                _id: "$$comment._id",
                                Content: "$$comment.Content",
                                LastEdition: "$$comment.LastEdition",
                                usercomment: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$commentUsers",
                                                        as: "u",
                                                        cond: { $eq: ["$$u._id", "$$comment.UserId"] }
                                                    }
                                                },
                                                as: "u",
                                                in: {
                                                    _id: "$$u._id",
                                                    Name: "$$u.Name",
                                                    Avatar: "$$u.Avatar"
                                                }
                                            }
                                        },
                                        0
                                    ]
                                },
                            }
                        }
                    },
                }
            }

        ]);
        // convert to object
        ideas.map((idea) => {
            idea.userPost = idea.userPost.pop()
            idea.category = idea.category.pop()
            idea.FirstClosureDate = idea.FirstClosureDate.pop()
            idea.LastClosureDate = idea.LastClosureDate.pop()
        })
        const events = await Academic.find() //get all events
        const categories = await Category.find() // get all categories
        res.status(200).json({ success: true, ideas, categories, events })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route PUT api/idea/update/:id
// @desc update idea
// @access Private Staff
router.put('/update/:id',verifyToken, async (req, res) => {
    // check denided
    if(!verifyRole("Staff",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

    const { Title, Description, Anonymous } = req.body
    // validation first deadline
    const ClosureDate = await Academic.findOne({ AcademicYear: new Date().getFullYear() })
    if (ClosureDate.FirstClosureDate <= new Date()) {
        return res.status(400).json({ success: false, message: "Posting has expired" })
    }
    // validation title require
    if (!Title) {
        return res.status(400).json({ success: false, message: 'Title is required!', Title, Description })
    }
    try {
        // create update object
        let updatedIdea = {
            Title,
            Description,
            Anonymous,
            AcademicYear: new Date().getFullYear()
        }

        const ideaUpdateCondition = { _id: req.params.id }
        // update
        updatedIdea = await Idea.findOneAndUpdate(
            ideaUpdateCondition,
            updatedIdea,
            { new: true }
        )

        // User not authorised to update post or post not found
        if (!updatedIdea)
            return res.status(403).json({
                success: false,
                message: 'Post not found or user not authorised'
            })

        res.status(200).json({
            success: true,
            message: 'Excellent progress!',
            idea: updatedIdea
        })

    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internla server error' })
    }
})

// @route DELETE api/idea/deleteIdea/:id
// @desc delete idea
// @access Private Staff
router.delete('/deleteIdea/:id',verifyToken, async (req, res) => {
    try {
        // check denided
        if(!verifyRole("Staff",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
        // validation first deadline
        const ClosureDate = await Academic.findOne({ AcademicYear: new Date().getFullYear() })
        if (ClosureDate.FirstClosureDate <= new Date()) {
            return res.status(400).json({ success: false, message: "Posting has expired" })
        }
        const ideaDeleteCondition = { _id: req.params.id }
        await Comment.deleteMany({ IdeaId: ideaDeleteCondition }) // delete related comments
        await state.deleteMany({ IdeaId: ideaDeleteCondition })   // delete related states
        await File.deleteMany({ IdeaId: ideaDeleteCondition })    // delete related files
        const deletedIdea = await Idea.findOneAndDelete(ideaDeleteCondition)    // delete idea

        // User not authorised or post not found
        if (!deletedIdea)
            return res.status(403).json({
                success: false,
                message: 'Post not found or user not authorised'
            })

        res.status(200).json({ success: true, deletedIdea: deletedIdea })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route GET api/idea/home
// @desc get all information of home page for staff
// @access Private 
router.get('/home',verifyToken, async (req, res) => {
    try {
        // get all ideas
        const ideas = await Idea.aggregate([
            {
                $match: {

                }
            },
            {
                $lookup: {
                    from: "commentideas",
                    localField: "_id",
                    foreignField: "IdeaId",
                    as: "comments"
                }
            },
            {
                $lookup: {
                    from: "academics",
                    localField: "AcademicYear",
                    foreignField: "Year",
                    as: "academic"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "comments.UserId",
                    foreignField: "_id",
                    as: "commentUsers"
                }
            },
            {
                $lookup: {
                    from: "files",
                    localField: "_id",
                    foreignField: "IdeaId",
                    as: "files"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "UserId",
                    foreignField: "_id",
                    as: "users"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "CategoryId",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $lookup: {
                    from: "states",
                    let: { ideaId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$$ideaId", "$ideaId"] },
                                $or: [{ state: "like" }, { state: "dislike" }, { state: "view" }]
                            }
                        },
                        {
                            $group: {
                                _id: "$state",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    as: "stateCounts"
                }
            },
            {
                $addFields: {
                    viewCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "view"] }
                                    }
                                },
                                as: "viewCount",
                                in: "$$viewCount.count"
                            }
                        }
                    },
                    likeCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "like"] }
                                    }
                                },
                                as: "likeCount",
                                in: "$$likeCount.count"
                            }
                        }
                    },
                    dislikeCount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$stateCounts",
                                        as: "stateCount",
                                        cond: { $eq: ["$$stateCount._id", "dislike"] }
                                    }
                                },
                                as: "dislikeCount",
                                in: "$$dislikeCount.count"
                            }
                        }
                    }
                }
            },
            {
                $sort: {
                    LastEdition: -1
                }
            },
            {
                $project: {
                    _id: 1,
                    Title: 1,
                    Description: 1,
                    LastEdition: 1,
                    Anonymous: 1,
                    AcademicYear: 1,
                    FirstClosureDate: "$academic.FirstClosureDate",
                    LastClosureDate: "$academic.LastClosureDate",
                    userPost: {
                        $map: {
                            input: "$users",
                            as: "user",
                            in: {
                                _id: "$$user._id",
                                Name: "$$user.Name",
                                Avatar: "$$user.Avatar",
                            }
                        }
                    },
                    totallike: "$likeCount",
                    totaldislike: "$dislikeCount",
                    totalview: "$viewCount",
                    category: {
                        $map: {
                            input: "$category",
                            as: "category",
                            in: {
                                _id: "$$category._id",
                                Name: "$$category.Title"
                            }
                        }
                    },
                    files: {
                        $map: {
                            input: "$files",
                            as: "file",
                            in: {
                                Url: "$$file.Link"
                            }
                        }
                    }
                    ,
                    comments: {
                        $map: {
                            input: "$comments",
                            as: "comment",
                            in: {
                                _id: "$$comment._id",
                                Content: "$$comment.Content",
                                LastEdition: "$$comment.LastEdition",
                                Anonymous: '$$comment.Anonymous',
                                usercomment: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$commentUsers",
                                                        as: "u",
                                                        cond: { $eq: ["$$u._id", "$$comment.UserId"] }
                                                    }
                                                },
                                                as: "us",
                                                in: {
                                                    _id: "$$us._id",
                                                    Name: "$$us.Name",
                                                    Avatar: "$$us.Avatar"
                                                }
                                            }
                                        },
                                        0
                                    ]
                                },
                            }
                        }
                    },
                }
            }
        ]);
        // convert to object
        ideas.map((idea) => {
            idea.userPost = idea.userPost.pop()
            idea.category = idea.category.pop()
            idea.FirstClosureDate = idea.FirstClosureDate.pop()
            idea.LastClosureDate = idea.LastClosureDate.pop()
        })
        const events = await Academic.find() //get all events
        const categories = await Category.find() // get all categories
        const trending = [...ideas].sort((a, b) => b.totalview - a.totalview).slice(0, 5); // get top trending view
        const toplike = [...ideas].sort((a, b) => b.totallike - a.totallike).slice(0, 5);  // get top trending like
        const topdislike = [...ideas].sort((a, b) => b.totaldislike - a.totaldislike).slice(0, 5); // get top trending dislike
        res.status(200).json({ success: true, ideas, categories, events, trending, topdislike, toplike })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})
// @route GET api/idea/toptrending
// @desc get top trending
// @access Private 
router.get('/toptrending',verifyToken, async (req, res) => {
    try {
        // get top 5 idea with view, like
        const result = await state.aggregate([
            {
                $match: {}
            },
            {
                $group: {
                    _id: { ideaId: "$ideaId", state: "$state" },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.ideaId",
                    view: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.state", "view"] },
                                "$count",
                                0
                            ]
                        }
                    },
                    like: {
                        $sum: {
                            $cond: [
                                { $eq: ["$_id.state", "like"] },
                                "$count",
                                0
                            ]
                        }
                    }
                }
            },
            {
                $sort: { view: -1 }
            },

            {
                $limit: 5
            },
            {
                $project: {
                    _id: 1,
                    view: 1,
                    like: 1
                }
            }
        ]);
        const resultIds = result.map(res => res._id);
        // add userPost
        const add = await Idea.aggregate([
            {
                $match: {
                    '_id': { $in: resultIds.map(id => ObjectId(id)) }
                }
            },
            {
                $lookup: {
                    from: "states",
                    localField: "_id",
                    foreignField: "ideaId",
                    as: "idea"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "UserId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            {
                $project: {
                    _id: 1,
                    Url: 1,
                    userPost: "$user.Name"
                }
            }
        ])
        for (let i = 0; i < result.length; i++) {
            result[i] = Object.assign(result[i], add[i]);
        }
        return res.status(200).json({ success: true, result })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route GET api/idea/recommend
// @desc recommend idea focus department of user 
// @access Private Staff
router.get('/recommend',verifyToken, async (req, res) => {
    try {
        // check denided
        if(!verifyRole("Staff",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
        
        // get list idea and user from view
        const Department = req.query.Department
        const recommend = await state.aggregate([
            // match state view
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $match: {
                    'user.Department': Department
                }
            },
            { $match: { state: "view" } },

            // group by ideaId and count the number of states
            {
                $group: {
                    _id: "$ideaId",
                    stateCount: { $sum: 1 }
                }
            },

            // sort by stateCount descending
            { $sort: { stateCount: -1 } },

            // limit to top 10
            { $limit: 3 },

            // lookup idea details
            {
                $lookup: {
                    from: "ideas",
                    localField: "_id",
                    foreignField: "_id",
                    as: "idea"
                }
            },

            // project only the idea fields we need
            {
                $project: {
                    _id: 0,
                    ideaId: "$_id",
                    stateCount: 1,
                    idea: { $arrayElemAt: ["$idea", 0] }
                }
            }
        ])

        return res.status(200).json({ success: true, state: recommend })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

module.exports = router

