const express = require('express')
const router = express.Router()

const month = new Date().getMonth() // return 0-11, we need before now 1 month so don't edit
const { verifyToken, verifyRole } = require('../middleware/auth') // Middleware

//models
const CommentIdea = require('../models/CommentIdea')
const Idea = require('../models/Idea')
const State = require('../models/State')
const Category = require('../models/Category')
const User = require('../models/User')

// @route GET api/dashboard/chars
// @desc get data for char 
// @access Private qam
router.get('/chars',verifyToken, async (req, res) => {
  // check denided
  if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

  // get total idea each month 
  try {
    const totalIdeaEachMonth = await Idea.aggregate([
      {
        $group: {
          _id: { $month: "$LastEdition" },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          month: "$_id",
          count: 1,
          _id: 0
        }
      }
    ])

    //get state (like,dislike,comment) each month
    let totalStateEachMonth = await State.aggregate([
      {
        $match: {
          state: { $in: ["like", "dislike"] }
        }
      },
      {
        $facet: {
          like: [
            {
              $match: { state: "like" }
            },
            {
              $group: {
                _id: { month: { $month: "$createAt" } },
                likeCount: { $sum: 1 }
              }
            }
          ],
          dislike: [
            {
              $match: { state: "dislike" }
            },
            {
              $group: {
                _id: { month: { $month: "$createAt" } },
                dislikeCount: { $sum: 1 }
              }
            }
          ]
        }
      },
      {
        $project: {
          month: "$like._id.month",
          likeCount: "$like.likeCount",
          dislikeCount: "$dislike.dislikeCount",
          _id: 0
        }
      }
    ])
    //get comment each month 
    const totalCommentEachMonth = await CommentIdea.aggregate([
      {
        $group: {
          _id: { $month: "$LastEdition" },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          month: "$_id",
          count: 1,
          _id: 0
        }
      }
    ])
    // Insert to null month
    for (let i = 1; i <= 12; i++) {
      if (!totalIdeaEachMonth.some(obj => obj.month === i)) {
        totalIdeaEachMonth.push({ "count": 0, "month": i })
      }
      if (!totalStateEachMonth.some(obj => obj.month[0] === i)) {
        totalStateEachMonth.push({ "month": [i], "likeCount": [0], "dislikeCount": [0] })
      }
      if (!totalCommentEachMonth.some(obj => obj.month === i)) {
        totalCommentEachMonth.push({ "count": 0, "month": i })
      }
    }
    // sort follow month
    totalIdeaEachMonth.sort(function (obj1, obj2) {
      return obj1.month - obj2.month;
    });
    totalStateEachMonth.sort(function (obj1, obj2) {
      return obj1.month[0] - obj2.month[0];
    });
    totalCommentEachMonth.sort(function (obj1, obj2) {
      return obj1.month - obj2.month;
    });

    // char: rate number of idea each department 
    const ratingIdeaEachDepartment = await Idea.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "UserId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $group: {
          _id: '$user.Department',
          persent: { $sum: 1 }
        }
      }
    ])
    const allIdea = await Idea.find()
    ratingIdeaEachDepartment.map((department) => {
      department.persent = (department.persent / allIdea.length) * 100
    })
    //char: rate all user post idea/department
    const ratingAllUserPostIdeaEachDepartment = await Idea.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "UserId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $group: {
          _id: {
            Department: "$user.Department",
            UserId: "$UserId"
          },
          count: {
            $sum: 1
          }
        }
      },
      {
        $group: {
          _id: "$_id.Department",
          nUser: {
            $sum: 1
          }
        }
      }
    ]);

    return res.status(200).json({ success: true, totalIdeaEachMonth, totalStateEachMonth, totalCommentEachMonth, ratingIdeaEachDepartment, ratingAllUserPostIdeaEachDepartment });
  }
  catch (err) {
    console.log(err)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
})

// @route GET api/dashboard/statistic
// @desc get statistic data
// @access Private qam
router.get('/statistic',verifyToken, async (req, res) => {
  try {
    // check denided
    if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

    // get total of idea 
    const totalIdea = await Idea.find()

    // get list idea last month
    const listIdeasLastMonth = []
    totalIdea.map((idea) => {
      if (idea.LastEdition.getMonth() + 1 == month) listIdeasLastMonth.push(idea)
    })
    // get total like, view
    const totalLike = await State.find({ state: 'like' })
    const totalView = await State.find({ state: 'view' })

    // get total view each category
    const categories = await Category.aggregate([
      {
        $lookup: {
          from: "ideas",
          localField: "_id",
          foreignField: "CategoryId",
          as: "ideas"
        }
      },
      {
        $lookup: {
          from: "states",
          localField: "ideas._id",
          foreignField: "ideaId",
          as: "states"
        }
      },
      {
        $project: {
          _id: 1,
          Title: 1,
          ideas: {
            $map: {
              input: "$ideas",
              as: "idea",
              in: {
                _id: "$$idea._id",
                Title: "$$idea.Title",
                states: {
                  $filter: {
                    input: "$states",
                    as: "state",
                    cond: {
                      $and: [
                        { $eq: ["$$state.state", "view"] },
                        { $eq: ["$$idea._id", "$$state.ideaId"] }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    //format array: Title, total view
    let count = []

    categories.map((category) => {
      let sum = 0
      let cate = [category.Title]
      category.ideas.map((idea) => {
        sum = sum + idea.states.length
      })
      cate.push(sum)
      count.push(cate)
    })

    // get max view of above array
    let max = count[0]
    count.map((element) => {
      if (element[1] > max[1]) return max = element
      else return max
    })

    return res.status(200).json({ success: true, totalIdea: totalIdea.length, totalLike: totalLike.length, totalView: totalView.length, max, countIdeasLastMonth: listIdeasLastMonth.length })
  }
  catch (err) {
    console.log(err)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
})

// @route GET api/dashboard/contributors
// @desc get data for contributor table
// @access Private qam
router.get('/contributors',verifyToken, async (req, res) => {
  try {
    // check denided
    if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

    // get total idea each category
    const contributors = await Category.aggregate([
      {
        $lookup: {
          from: 'ideas',
          localField: '_id',
          foreignField: 'CategoryId',
          as: 'ideas'
        }
      },
      {
        $project: {
          Title: 1,
          IdeaCount: { $size: "$ideas" }
        }
      }
    ])
    // get users post idea each category
    const topContributorsByCategory = await Idea.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "UserId",
          foreignField: "_id",
          as: "user"
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
        $group: {
          _id: {
            CategoryId: "$CategoryId",
            UserId: "$UserId"
          },
          count: { $sum: 1 },
          avatar: { $first: "$user.Avatar" },
          categoryTitle: { $first: "$category.Title" }
        }
      },
      {
        $sort: { "count": -1 }
      },
      {
        $group: {
          _id: "$_id.CategoryId",
          contributors: { $push: { avatar: "$avatar", count: "$count" } }
        }
      },
      {
        $project: {
          _id: 0,
          CategoryId: "$_id",
          contributor: "$contributors"
        }
      }
    ]);
    // compare => format: category,totalidea, contributors
    contributors.map((category) => {
      topContributorsByCategory.map((butor) => {
        if (category._id.equals(butor.CategoryId)) {
          category.contributor = butor.contributor
        }
      })
    })
    return res.status(200).json({ success: true, contributors })
  }
  catch (err) {
    console.log(err)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
})

// @route GET api/dashboard/notifications
// @desc get data for notifications
// @access Private qam qac
router.get('/notifications',verifyToken, async (req, res) => {
  try {
    // check denided
    if(!verifyRole("QAM",req.Role) && !verifyRole("QAC",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
    let ideas
    //get idea and user's post idea 
    if(!req.query.department){
      ideas = await Idea.aggregate([
        {
          $match: {}
        },
        {
          $lookup: {
            from: 'users',
            localField: 'UserId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            _id: 1,
            Title: 1,
            LastEdition: 1,
            Url: 1,
            User: {
              $map: {
                input: '$user',
                as: 'user',
                in: {
                  name: '$$user.Name',
                  avatar: '$$user.Avatar'
                }
              }
            }
          }
        }, {
          $sort: {
            LastEdition: -1
          }
        }
      ])
    }else{
      ideas = await Idea.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'UserId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $match: {
            'user.Department':req.query.department
          }
        },
        {
          $project: {
            _id: 1,
            Title: 1,
            LastEdition: 1,
            Url: 1,
            User: {
              $map: {
                input: '$user',
                as: 'user',
                in: {
                  name: '$$user.Name',
                  avatar: '$$user.Avatar'
                }
              }
            }
          }
        }, {
          $sort: {
            LastEdition: -1
          }
        }
      ])
    }
    

    //format => object
    ideas.map((idea) => {
      idea.User = idea.User.pop()
    })
    return res.status(200).json({ success: true, ideas })
  }
  catch (err) {
    console.log(err.message)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
})
module.exports = router
