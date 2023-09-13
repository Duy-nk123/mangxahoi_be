const express = require('express')
const router = express.Router()

const { verifyToken, verifyRole } = require('../middleware/auth') // Middleware
//models
const Category = require('../models/Category');
const Idea = require('../models/Idea');

// @route GET api/category/showAll
// @desc Return all category
// @access Private QAM
router.get('/showAll',verifyToken, async (req, res) => {
	try {
		// check denided
		if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
		//find all category
		const categories = await Category.aggregate([
			{
				$lookup:{
					from:'ideas',
					localField:'_id',
					foreignField:'CategoryId',
					as:'ideas'
				}
			},
			{
				$project:{
					_id:1,
					Title:1,
					Description:1,
					DateInnitiated:1,
					Status:1,
					Ideas:{
						$map:{
							input:'$ideas',
							as:'idea',
							in:{
								_id:'$$idea._id'
							}
						}
					}
				}
			}
		])
		console.log(categories)
		res.status(200).json({ success: true, categories })
	} catch (error) {
		console.log(error)
		res.status(500).json({ success: false, message: 'Internal server error' })
	}
})

// @route POST api/category/addCategory
// @desc add new category
// @access Private QAM
router.post('/addCategory',verifyToken, async (req, res) => {
	const { Title, Description, DateInnitiated, Status } = req.body
	// check denided
    if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
	//validation required information
	if (!Title || !Status || !DateInnitiated || !Description) return res.status(400).json({ success: false, message: "Please enter full information", Title, Description, DateInnitiated, Status })

	//validation exsisted title of category
	const inValidTitle = await Category.findOne({ Title })
	if (inValidTitle) return res.status(400).json({ success: false, message: "Title is exitsted" })

	//create new category and save
	try {
		const newCategory = new Category({
			Title,
			Description,
			DateInnitiated,
			Status
		})
		await newCategory.save()
		return res.status(200).json({ success: true, message: 'Successfully', category: newCategory })
	}
	catch (error) {
		console.log(error)
		res.status(500).json({ success: false, message: 'Internal server error' })
	}
})

// @route PUT api/category/updateCategory/:id
// @desc Update category 
// @access Private QAM
router.put('/updateCategory/:id',verifyToken, async (req, res) => {
	const { Title, Description, Status } = req.body
	// check denided
    if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

	// validation required information
	if (!Title || !Description || !Status) return res.status(400).json({ success: false, message: "Please enter full information" })

	//validation invalid (not exsisted) category 
	const id = req.params.id
	const validId = await Category.findOne({_id:id})
	if (!validId) return res.status(404).json({ success: false, message: "Not found this category" })

	//update category
	try {
		let updatedCategory = {
			Title,
			Description,
			Status
		}

		const categoryUpdateCondition = { _id: req.params.id }

		updatedCategory = await Category.findOneAndUpdate(
			categoryUpdateCondition,
			updatedCategory,
			{ new: true }
		)

		// User not authorised to update post or post not found
		if (!updatedCategory) return res.status(400).json({ success: false, message: 'Update failed, please try again' })
		res.status(200).json({ success: true, message: 'Excellent progress!', category: updatedCategory })
	}
	catch (error) {
		console.log(error.message)
		res.status(500).json({ success: false, message: 'Internal server error' })
	}
})

// @route DELETE api/category/deleteCategory/:id
// @desc Delete category
// @access Private QAM
router.delete('/deleteCategory/:id',verifyToken, async (req, res) => {
	try {
		// check denided
		if(!verifyRole("QAM",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
		
		//find category
		const categoryDeleteCondition = { _id: req.params.id }

		// delete all idea of this category
		await Idea.deleteMany({ CategoryId: categoryDeleteCondition })

		// delete this category
		const deletedCategory = await Category.findOneAndDelete(categoryDeleteCondition)

		// User not authorised or post not found
		if (!deletedCategory) return res.status(400).json({ success: false, message: 'Delete failed, please try again' })
		res.status(200).json({ success: true, category: deletedCategory })
	} catch (error) {
		console.log(error)
		res.status(500).json({ success: false, message: 'Internal server error' })
	}
})

module.exports = router