const jwt = require('jsonwebtoken')

const verifyToken = (req, res, next) => {
	const authHeader = req.header('Authorization')
	const token = authHeader && authHeader.split(' ')[1]
	if (!token)
    
	return res
	.status(401)
	.json({ success: false, message: 'Access token not found' })

	try {
		const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

		req.UserId = decoded.accountId
		req.Role = decoded.role
		next()
	} catch (error) {
		console.log(error)
		return res.status(401).json({ success: false, message: 'Invalid token' })
	}
}
const verifyTokenFromQueryString = (req, res, next) => {
	const authHeader = req.query.accessToken
	console.log(authHeader)
	const token = authHeader
	if (!token)
    
	return res
	.status(401)
	.json({ success: false, message: 'Access token not found' })

	try {
		const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

		req.UserId = decoded.accountId
		req.Role = decoded.role
		next()
	} catch (error) {
		console.log(error)
		return res.status(401).json({ success: false, message: 'Invalid token' })
	}
}
function verifyRole(exceptedRole,actualRole){
	if(!(exceptedRole === actualRole)){
		console.log(exceptedRole,actualRole)
		return false
	}
	else return true
}

module.exports = {verifyToken,verifyRole,verifyTokenFromQueryString}