const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already in use' });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({ name, email, password_hash });

    // Generate token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during signup' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'name', 'email'] });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching profile' });
  }
};

exports.convertGuestToUser = async (req, res) => {
  try {
    const { name, email, password, guestId } = req.body;
    const { Guest, ExpenseSplit, Expense, GroupMember } = require('../models');

    const guest = await Guest.findByPk(guestId);
    if (!guest) return res.status(404).json({ error: 'Guest profile not found' });

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already in use' });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await User.create({ name, email, password_hash });

    await ExpenseSplit.update(
      { user_id: user.id, guest_id: null },
      { where: { guest_id: guestId } }
    );

    await Expense.update(
      { paid_by_user_id: user.id, paid_by_guest_id: null },
      { where: { paid_by_guest_id: guestId } }
    );

    if (guest.group_id) {
      await GroupMember.findOrCreate({
        where: { group_id: guest.group_id, user_id: user.id },
        defaults: { role: 'member', joined_at: new Date() }
      });
    }

    await guest.destroy();

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to promote guest to user' });
  }
};

exports.getUnclaimedGuests = async (req, res) => {
  try {
    const { Guest } = require('../models');
    const guests = await Guest.findAll({ attributes: ['id', 'name', 'group_id'] });
    res.json({ guests });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve guest list' });
  }
};
