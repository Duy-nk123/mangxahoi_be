const express = require('express')
const router = express.Router()

const { verifyToken, verifyRole } = require('../middleware/auth') // Middleware
const Academic = require('../models/Academic') // models

// @route GET api/event/allEvent
// @desc get all event 
// @access Private
router.get('/allEvent',verifyToken, async (req, res) => {
    try {
        //get list all event
        const events = await Academic.find()
        return res.status(200).json({ success: true, events })
    }
    catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})
// @route POST api/event/createAcademicYear
// @desc Create event 
// @access Private administrator
router.post('/createAcademicYear',verifyToken, async (req, res) => {
    const { Year, FirstClosureDate, LastClosureDate } = req.body
    // check denided
    if(!verifyRole("Administrator",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
    // Validation for required information
    if (!Year || !FirstClosureDate || !LastClosureDate)
        return res.status(400).json({ success: false, message: 'Information is required!' })

    // Validation for valid event (year)
    const existingYear = await Academic.findOne({Year: Year })
    if (existingYear)
        return res.status(400).json({ success: false, message: 'Academic year is existed!' })

    //validation for valid deadline of event
    if (FirstClosureDate >= LastClosureDate) return res.status(400).json({ success: false, message: 'Set time for closure date is invalid' })

    //create and save new event
    try {
        const newAcademic = new Academic({
            Year,
            FirstClosureDate,
            LastClosureDate
        })

        await newAcademic.save()

        res.status(200).json({ success: true, message: 'Create event successful', newAcademic: newAcademic })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route PUT api/event/updateAcademic/:id
// @desc update event
// @access Private administrator
router.put('/updateAcademic/:id',verifyToken, async (req, res) => {
    const { Year, FirstClosureDate, LastClosureDate } = req.body
    // check denided
    if(!verifyRole("Administrator",req.Role))return res.status(401).json({ success: false, message: "Access denided" })

    // Validation for required information
    if (!Year || !FirstClosureDate || !LastClosureDate) return res.status(400).json({ success: false, message: 'Information is required!' })

    // Validation for valid event (year)
    const validYear = await Academic.findOne({ _id: req.params.id })
    if (!validYear) return res.status(400).json({ success: false, message: 'Year is invalid' })

    //validation for valid deadline of event
    if (FirstClosureDate >= LastClosureDate) return res.status(400).json({ success: false, message: 'Set time for closure date is invalid' })

    //update event
    try {
        let updatedAcademic = {
            Year,
            FirstClosureDate,
            LastClosureDate
        }

        const academicUpdateCondition = { _id: req.params.id }

        updatedAcademic = await Academic.findOneAndUpdate(
            academicUpdateCondition,
            updatedAcademic,
            { new: true }
        )

        // User not authorised to update post or post not found
        if (!updatedAcademic)
            return res.status(403).json({
                success: false,
                message: 'Academic not found or user not authorised'
            })

        res.status(200).json({
            success: true,
            message: 'Excellent progress!',
            update: updatedAcademic
        })

    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})


module.exports = router