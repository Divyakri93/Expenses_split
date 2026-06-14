const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite', // Local file for testing without PostgreSQL
  logging: false,
});

module.exports = sequelize;
