const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Guest = sequelize.define('Guest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: 'guests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Guest;
