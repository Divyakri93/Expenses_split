const express = require('express');
const { signup, login, getMe, convertGuestToUser, getUnclaimedGuests } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/signup-guest', convertGuestToUser);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/guests', getUnclaimedGuests);

module.exports = router;
