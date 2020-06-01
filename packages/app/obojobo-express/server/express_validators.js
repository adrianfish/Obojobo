const { check, validationResult } = require('express-validator/check')
const logger = oboRequire('server/logger')

const semVerRegex = /\d+\.\d+\.\d+/

// reusable method to call a promise method on req
// and make sure it's value isn't falsy and is an object
// if it fails it'll register a validation error for express-validate
const requireAndValidateReqMethod = (req, next, method, prop) => {
	return req[method]()
		.then(() => {
			if (!req[prop] || typeof req[prop] !== 'object') throw `Request missing ${prop}`
		})
		.catch(error => {
			logger.error('requireAndValidateReqMethod error', error)
			if (!req._validationErrors) req._validationErrors = []
			req._validationErrors.push({
				location: 'request',
				param: prop,
				value: req[prop],
				msg: `missing from request`
			})
		})
		.then(() => {
			next() //always call next, unlike user auth, we're letting checkValidationRules handle this
		})
}

// this is defined differently so it can be reused in other exports easily
const requireCurrentUser = (req, res, next, permission = null) => {
	return req
		.requireCurrentUser()
		.then(user => {
			if (!user || typeof user !== 'object') throw 'Missing User'
			if (permission && !user[permission]) throw 'Not Authorized'
			next()
		})
		.catch(error => {
			logger.error('Missing required current user or perms.')
			logger.info(error)
			res.notAuthorized()
		})
}

exports.requireCurrentUser = requireCurrentUser
exports.requireCurrentVisit = (req, res, next) =>
	requireAndValidateReqMethod(req, next, 'getCurrentVisitFromRequest', 'currentVisit')
exports.requireCurrentDocument = (req, res, next) =>
	requireAndValidateReqMethod(req, next, 'requireCurrentDocument', 'currentDocument')

exports.getCurrentUser = (req, res, next) => {
	return req.getCurrentUser().then(user => {
		next()
		return user
	})
}

// Valitator Middleware
// NOTE: YOU MUST RUN checkValidationRules AFTER THESE TO ENFORCE these check functions
exports.checkContentId = check('contentId', 'must be a valid UUID')
	.isUUID()
	.optional()
exports.requireDraftId = check('draftId', 'must be a valid UUID').isUUID()
exports.requireAttemptId = check('attemptId', 'must be a valid UUID').isUUID()
exports.requireVisitId = check('visitId', 'must be a valid UUID').isUUID()
exports.requireAssessmentId = check('assessmentId', 'must not be empty')
	.exists({ checkNull: true, checkFalsy: true })
	.isString()
exports.requireMultipleAttemptIds = [
	check('attemptIds', 'must be an array of UUIDs').isArray({ min: 1 }),
	check('attemptIds.*', 'must be a valid UUID').isUUID()
]
exports.validPageNumber = check('page', 'must be a valid int 1 or above')
	.optional()
	.isInt({ min: 1, allow_leading_zeroes: false })

exports.validPerPageNumber = check('per_page', 'must be a valid int between 1 and 100')
	.optional()
	.isInt({ min: 1, max: 100, allow_leading_zeroes: false })

exports.requireEvent = [
	check('event.action', 'must not be empty')
		.exists({ checkNull: true, checkFalsy: true })
		.isString(),
	check('event.actor_time', 'must be a valid ISO8601 date string').isISO8601(),
	check('event.draft_id', 'must be a valid UUID').isUUID(),
	check('event.event_version', 'must match a valid semVer string').matches(semVerRegex)
]
exports.requireCanViewEditor = (req, res, next) =>
	requireCurrentUser(req, res, next, 'canViewEditor')
exports.requireCanCreateDrafts = (req, res, next) =>
	requireCurrentUser(req, res, next, 'canCreateDrafts')
exports.requireCanDeleteDrafts = (req, res, next) =>
	requireCurrentUser(req, res, next, 'canDeleteDrafts')
exports.requireCanPreviewDrafts = (req, res, next) =>
	requireCurrentUser(req, res, next, 'canPreviewDrafts')

exports.checkValidationRules = (req, res, next) => {
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		const displayErrors = []
		const rawErrors = errors.mapped()
		for (const i in rawErrors) {
			const e = rawErrors[i]
			displayErrors.push(`${e.param} ${e.msg}, got ${e.value}`)
		}

		const joinedErrors = displayErrors.join(', ')
		logger.error(joinedErrors)
		return res.badInput(joinedErrors)
	}

	next()
}