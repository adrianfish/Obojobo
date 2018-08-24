jest.mock('../insert_event')
jest.mock('../models/user')
jest.mock('../models/draft')
jest.mock('../db')
jest.mock('../logger')

const insertEvent = oboRequire('insert_event')
const User = oboRequire('models/user')
const DraftDocument = oboRequire('models/draft')
const logger = oboRequire('logger')
const db = oboRequire('db')
const ltiLaunch = oboRequire('express_lti_launch')

// array of mocked express middleware request arguments
const mockExpressArgs = withLtiData => {
	const res = {}

	const req = {
		session: {},
		connection: { remoteAddress: '1.1.1.1' },
		params: {
			draftId: '999'
		},
		setCurrentUser: jest.fn(),
		setCurrentDocument: jest.fn(),
		requireCurrentDocument: jest.fn().mockResolvedValue({
			draftId: '999',
			contentId: '12'
		}),
		hostname: 'dummyhost'
	}

	const mockNext = jest.fn()

	if (withLtiData) {
		req.lti = {
			body: {
				lis_person_sourcedid: '2020',
				lis_person_contact_email_primary: 'mann@internet.com',
				lis_person_name_given: 'Hugh',
				lis_person_name_family: 'Mann',
				roles: ['saviour', 'explorer', 'doctor']
			}
		}
	}
	return [req, res, mockNext]
}

describe('lti launch middleware', () => {
	beforeAll(() => {})
	afterAll(() => {})
	beforeEach(() => {
		insertEvent.mockReset()
		insertEvent.mockResolvedValue()
		db.one.mockReset()
		db.one.mockResolvedValue({ id: 88 })
		User.saveOrCreateCallback.mockReset()
		logger.error.mockReset()
		DraftDocument.fetchById = jest.fn().mockResolvedValueOnce(
			new DraftDocument({
				draftId: '999',
				contentId: 12
			})
		)
	})
	afterEach(() => {})

	test('assignment returns a promise and short circuits to next if not a LTI request, skipping launch logic', () => {
		expect.assertions(2)
		const [req, res, mockNext] = mockExpressArgs(false)
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith()
			// next can be called in several places
			// make sure we're not getting into the logic
			// that creates users
			expect(User.saveOrCreateCallback).not.toHaveBeenCalled()
		})
	})

	test('assignment inserts data correctly with lti data', () => {
		expect.assertions(2)

		const [req, res, mockNext] = mockExpressArgs(true)

		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			// tests to see if the launch is being stored
			// there's no external handles to the method
			// so we're watching db.one to see if it was inserted
			expect(db.one).toBeCalledWith(
				expect.stringContaining('INSERT INTO launches'),
				expect.objectContaining({
					data: {
						lis_person_contact_email_primary: 'mann@internet.com',
						lis_person_name_family: 'Mann',
						lis_person_name_given: 'Hugh',
						lis_person_sourcedid: '2020',
						roles: ['saviour', 'explorer', 'doctor']
					},
					draftId: '999',
					userId: 1
				})
			)

			// lets also make sure insert event is geting called
			// with the data we expec
			expect(insertEvent).toBeCalledWith(
				expect.objectContaining({
					action: 'lti:launch',
					actorTime: expect.any(String),
					draftId: '999',
					ip: '1.1.1.1',
					metadata: {},
					payload: {
						launchId: 88
					},
					userId: 1
				})
			)
		})
	})

	test('assignment inserts data correctly with example draft', () => {
		expect.assertions(2)

		const [req, res, mockNext] = mockExpressArgs(true)

		// because of the call to requireCurrentDocument, draft ids in
		// method aclls do not match the example draft
		req.params.draftId = 'example'
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			// tests to see if the launch is being stored
			// there's no external handles to the method
			// so we're watching db.one to see if it was inserted
			expect(db.one).toBeCalledWith(
				expect.stringContaining('INSERT INTO launches'),
				expect.objectContaining({
					contentId: '12',
					data: {
						lis_person_contact_email_primary: 'mann@internet.com',
						lis_person_name_family: 'Mann',
						lis_person_name_given: 'Hugh',
						lis_person_sourcedid: '2020',
						roles: ['saviour', 'explorer', 'doctor']
					},
					draftId: '999',
					lti_key: undefined, //eslint-disable-line no-undefined
					userId: 1
				})
			)

			// lets also make sure insert event is geting called
			// with the data we expec
			expect(insertEvent).toBeCalledWith(
				expect.objectContaining({
					action: 'lti:launch',
					actorTime: expect.any(String),
					draftId: '999',
					ip: '1.1.1.1',
					metadata: {},
					payload: {
						launchId: 88
					},
					userId: 1
				})
			)
		})
	})

	test('assignment returns a promise and short circuits to next if not a LTI request, skipping launch logic', () => {
		expect.assertions(2)

		const [req, res, mockNext] = mockExpressArgs(true)
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith()
			// next can be called in several places
			// make sure we're not getting caught by the logic
			// that bypasses everything
			expect(User.saveOrCreateCallback).toHaveBeenCalled()
		})
	})

	test('assignment calls next error with lti data when insert Launch fails', () => {
		expect.assertions(1)

		// mock insert launch fail
		db.one.mockRejectedValueOnce('launch insert error')

		const [req, res, mockNext] = mockExpressArgs(true)
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith(expect.any(Error))
		})
	})

	test('assignment calls next error with lti data when insert event fails', () => {
		expect.assertions(1)

		// mock insert event failure
		insertEvent.mockRejectedValueOnce('launch insert error')

		const [req, res, mockNext] = mockExpressArgs(true)
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith(expect.any(Error))
		})
	})

	test('assignment calls next error with no body', () => {
		expect.assertions(1)

		// mock insert event failure
		insertEvent.mockRejectedValueOnce('launch insert error')

		const [req, res, mockNext] = mockExpressArgs(true)
		req.lti.body = null

		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith(expect.any(Error))
		})
	})

	test('assignment sets the current user', () => {
		expect.assertions(2)

		const [req, res, mockNext] = mockExpressArgs(true)
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(req.setCurrentUser).toBeCalledWith(expect.any(User))
			expect(req.setCurrentUser).toBeCalledWith(
				expect.objectContaining({
					username: '2020',
					email: 'mann@internet.com',
					firstName: 'Hugh',
					lastName: 'Mann',
					roles: expect.any(Array)
				})
			)
		})
	})

	test('assignment sets the current draft', () => {
		expect.assertions(1)

		const [req, res, mockNext] = mockExpressArgs(true)
		return ltiLaunch.assignment(req, res, mockNext).then(() => {
			expect(req.requireCurrentDocument).toHaveBeenCalledTimes(1)
			//expect(req.setCurrentDocument).toBeCalledWith(
			//expect.objectContaining({ contentId: 12, draftId: '999' })
			//)
		})
	})

	test('courseNavlaunch returns a promise and short circuits to next if not a LTI request, skipping launch logic', () => {
		expect.assertions(2)

		const [req, res, mockNext] = mockExpressArgs(false)
		return ltiLaunch.courseNavlaunch(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith()
			// next can be called in several places
			// make sure we're not getting into the logic
			// that creates users
			expect(User.saveOrCreateCallback).not.toHaveBeenCalled()
		})
	})

	test('courseNavlaunch creates a new user and calls req.setCurrentUser', () => {
		expect.assertions(4)

		const User = oboRequire('models/user')
		let createdUser

		User.saveOrCreateCallback.mockImplementationOnce(user => {
			createdUser = user
		})

		const [req, res, mockNext] = mockExpressArgs(true)

		return ltiLaunch.courseNavlaunch(req, res, mockNext).then(() => {
			// has saved that user
			expect(User.saveOrCreateCallback).toHaveBeenCalled()
			// has created a user object
			expect(createdUser).toHaveProperty('firstName')
			// that same user is now the current user
			expect(req.setCurrentUser).toBeCalledWith(createdUser)
			expect(mockNext).toBeCalledWith()
		})
	})

	test('courseNavlaunch logs an error if no user', () => {
		expect.assertions(4)

		User.saveOrCreateCallback.mockImplementationOnce(() => {
			throw 'this error'
		})
		const [req, res, mockNext] = mockExpressArgs(true)

		return ltiLaunch.courseNavlaunch(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith(expect.any(Error))

			expect(logger.error).toHaveBeenCalledTimes(2)
			expect(logger.error).toHaveBeenCalledWith('LTI Nav Launch Error', 'this error')
			expect(logger.error).toHaveBeenCalledWith('LTI Body', expect.any(Object))
		})
	})

	test('courseNavlaunch logs an error with no LTI body', () => {
		expect.assertions(4)

		const [req, res, mockNext] = mockExpressArgs(true)
		User.saveOrCreateCallback.mockImplementationOnce(() => {
			req.lti.body = null
			throw 'this error'
		})

		return ltiLaunch.courseNavlaunch(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith(expect.any(Error))

			expect(logger.error).toHaveBeenCalledTimes(2)
			expect(logger.error).toHaveBeenCalledWith('LTI Nav Launch Error', 'this error')
			expect(logger.error).toHaveBeenCalledWith('LTI Body', 'No LTI Body')
		})
	})

	test('assignmentSelection returns a promise and short circuits to next if not a LTI request, skipping launch logic', () => {
		expect.assertions(2)

		const [req, res, mockNext] = mockExpressArgs(false)

		return ltiLaunch.assignmentSelection(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith()
			// next can be called in several places
			// make sure we're not getting into the logic
			// that creates users
			expect(User.saveOrCreateCallback).not.toHaveBeenCalled()
		})
	})
	test('assignmentSelection creates a new user and inserts an event', () => {
		expect.assertions(5)

		let createdUser
		User.saveOrCreateCallback.mockImplementationOnce(user => {
			createdUser = user
		})
		const [req, res, mockNext] = mockExpressArgs(true)

		return ltiLaunch.assignmentSelection(req, res, mockNext).then(() => {
			// has saved that user
			expect(User.saveOrCreateCallback).toHaveBeenCalled()
			// has created a user object
			expect(createdUser).toHaveProperty('firstName')
			// that same user is now the current user
			expect(req.setCurrentUser).toBeCalledWith(createdUser)
			expect(insertEvent).toHaveBeenCalledTimes(1)
			expect(mockNext).toBeCalledWith()
		})
	})

	test('assignmentSelection logs an error if user creation fails and calls next with an error', () => {
		expect.assertions(4)

		User.saveOrCreateCallback.mockImplementationOnce(() => {
			throw 'this error'
		})

		const [req, res, mockNext] = mockExpressArgs(true)

		return ltiLaunch.assignmentSelection(req, res, mockNext).then(() => {
			expect(mockNext).toBeCalledWith(expect.any(Error))
			expect(logger.error).toHaveBeenCalledTimes(2)
			expect(logger.error).toHaveBeenCalledWith('LTI Picker Launch Error', 'this error')
			expect(logger.error).toHaveBeenCalledWith('LTI Body', expect.any(Object))
		})
	})

	test('assignmentSelection logs an error if event insert fails and calls next with an error', () => {
		expect.assertions(5)

		insertEvent.mockRejectedValueOnce('event insert error')
		const [req, res, mockNext] = mockExpressArgs(true)

		return ltiLaunch.assignmentSelection(req, res, mockNext).then(() => {
			expect(User.saveOrCreateCallback).toHaveBeenCalled()
			expect(mockNext).toBeCalledWith(expect.any(Error))
			expect(logger.error).toHaveBeenCalledTimes(2)
			expect(logger.error).toHaveBeenCalledWith('LTI Picker Launch Error', 'event insert error')
			expect(logger.error).toHaveBeenCalledWith('LTI Body', expect.any(Object))
		})
	})

	test('assignmentSelection logs an error with no lti body', () => {
		expect.assertions(5)

		const [req, res, mockNext] = mockExpressArgs(true)
		User.saveOrCreateCallback.mockImplementationOnce(() => {
			req.lti.body = null
			throw 'this error'
		})

		return ltiLaunch.assignmentSelection(req, res, mockNext).then(() => {
			expect(User.saveOrCreateCallback).toHaveBeenCalled()
			expect(mockNext).toBeCalledWith(expect.any(Error))
			expect(logger.error).toHaveBeenCalledTimes(2)
			expect(logger.error).toHaveBeenCalledWith('LTI Picker Launch Error', 'this error')
			expect(logger.error).toHaveBeenCalledWith('LTI Body', 'No LTI Body')
		})
	})
})
