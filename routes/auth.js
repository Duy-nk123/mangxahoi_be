const express = require('express')
const router = express.Router()

const argon2 = require('argon2') // hash password
const token = require('jsonwebtoken') // token
const { verifyToken, verifyRole } = require('../middleware/auth') // Middleware

//models
const Account = require('../models/Account')
const User = require('../models/User')

// @route POST api/auth/account/createAccount
// @desc Create account
// @access Private administrator
router.post('/account/createAccount',verifyToken, async (req, res) => {
    const { Username, Password, Role, PhoneNumber, Email, Department } = req.body
    // check denided
    if(!verifyRole("Administrator",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
    // check validation empty
    if (!Username || !Password || !Role || !PhoneNumber || !Email) return res.status(400).json({ success: false, message: 'Please enter full information' })

    //check Department empty if role is Staff or QAC
    if (!Department) {
        return res.status(400).json({ success: false, message: 'Please enter full information' })
    }
    try {
        const validuserUsername = await Account.findOne({ Username: Username })
        const validPhone = await User.findOne({ PhoneNumber: PhoneNumber })
        const validEmail = await User.findOne({ Email: Email })
        const defaultUrlAvatar = 'https://i.stack.imgur.com/l60Hf.png';

        //check validation Username exitsted
        if (validuserUsername) return res.status(400).json({ success: false, message: 'Username is exitsted' })
        if (validPhone) return res.status(400).json({ success: false, message: 'Phone number is exitsted' })
        if (validEmail) return res.status(400).json({ success: false, message: 'Email is exitsted' })

        //hash password
        const hashPassword = await argon2.hash(Password)
        const newAccount = new Account({ Username, Password: hashPassword, Role, Active: true })


        const newUser = new User({
            Name: "User",
            Gender: "Male",
            PhoneNumber,
            DoB: "01-01-1991",
            Email,
            Department,
            Avatar: defaultUrlAvatar,
            AccountId: newAccount,

        })

        //create Account => auto create User with AccountId
        await newAccount.save()
        await newUser.save()

        return res.status(200).json({ success: true, message: 'Successful', newAccount, Email, Department })
    }
    catch (error) {
        console.log(error.message)
        return res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route POST api/auth/account/login
// @desc Authenticate account
// @access Public
router.post('/account/login', async (req, res) => {
    const { Username, Password } = req.body

    // check validation empty
    if (!Username || !Password) return res.status(400).json({ success: false, message: "Please enter full information !!" })
    try {
        // check username and password valid
        const userValid = await Account.findOne({ Username })
        if (!userValid) return res.status(400).json({ success: false, message: "Username or password is invalid" })
        const passwordValid = await argon2.verify(userValid.Password, Password)
        if (!passwordValid) return res.status(400).json({ success: false, message: "Username or password is invalid" })

        // check active account
        if (!userValid.Active) return res.status(400).json({ success: false, message: "Your account is not active" })

        // get role
        const { Role, _id } = userValid

        //set token login - expires 30 days
        const accessToken = token.sign({
            accountId: userValid._id,
            role: userValid.Role, // add role
            exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
        }, process.env.ACCESS_TOKEN_SECRET);


        //get user of this account
        const user = await User.findOne({ AccountId: userValid._id })
        return res.status(200).json({ success: true, message: "Logged in successfully", accessToken, accountId: _id, role: Role, user })
    }
    catch (error) {
        console.log(error)
        return res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route GET api/auth/account/listAccount
// @desc Return list accounts
// @access Private administrator and QAC
router.get('/account/listAccount',verifyToken, async (req, res) => {
    //get list accounts
    if(!verifyRole("Administrator",req.Role) && !verifyRole("QAC",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
    try {
        let accounts = null
        if (!req.query.Department) {
            accounts = await Account.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: 'AccountId',
                        as: 'user'
                    }
                },
                {
                    $project: {
                        Username: 1,
                        Role: 1,
                        Active: 1,
                        Email: "$user.Email",
                        Department: "$user.Department"
                    }
                }
            ])
        }
        else {
            accounts = await Account.aggregate([
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: 'AccountId',
                        as: 'user'
                    }
                },
                {
                    $match: {
                        "user.Department": req.query.Department
                    }
                },
                {
                    $project: {
                        Username: 1,
                        Role: 1,
                        Active: 1,
                        Email: "$user.Email",
                        Department: "$user.Department"
                    }
                }
            ])
        }

        //check validation not any account
        if (!accounts)
            return res.status(403).json({
                success: false,
                message: 'Not any account'
            })
        res.status(200).json({ success: true, accounts })

    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route PUT api/account/changeAccountStatus/:id
// @desc change status active or disable of account
// @access Private administrator
router.put('/account/changeAccountStatus/:id',verifyToken, async (req, res) => {
    try {
        // check denided
        if(!verifyRole("Administrator",req.Role))return res.status(401).json({ success: false, message: "Access denided" })
        //find and change Active ><
        const AccountCondition = { _id: req.params.id }
        const changeAccount = await Account.findOne(AccountCondition)
        changeAccount.Active = !changeAccount.Active
        await changeAccount.save()

        if (!changeAccount) return res.status(403).json({ success: false, message: 'Account not found or user not authorised' })
        res.status(200).json({ success: true, changeAccount: changeAccount })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
})

// @route POST api/auth/account/changePassword/:id
// @desc Change password
// @access Private Staff-QAM-QAC
router.put('/account/changePassword/:id',verifyToken, async (req, res) => {
    const { Username, oldPassword, newPassword } = req.body
    try {
        //check valid account
        const userValid = await Account.findOne({ Username: Username })
        if (!userValid) return res.status(400).json({ success: false, message: "Username or password is invalid" })
        const checkUser = await argon2.verify(userValid.Password, oldPassword)
        if (!checkUser) return res.status(400).json({ success: false, message: 'Incorrect password' })

        // hash password
        const passUpdateCondition = { _id: req.params.id }
        const hashPassword = await argon2.hash(newPassword)

        // update account
        updatedPass = await Account.findOneAndUpdate(
            passUpdateCondition,
            {
                Username: Username,
                Password: hashPassword,
                Role: 'Staff'
            },
            { new: true }
        )
        res.status(200).json({ success: true, message: 'Excellent progress!', post: updatedPass })
    } catch (err) {
        console.error(err)
        return res.status(500).send('Internal Server Error')
    }
})

module.exports = router