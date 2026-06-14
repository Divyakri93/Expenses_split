const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ExpenseSplit = sequelize.define('ExpenseSplit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  expense_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  calculated_share_amount: {
    type: DataTypes.NUMERIC(12, 4),
    allowNull: false,
  },
  raw_split_value: {
    type: DataTypes.NUMERIC(12, 4),
    allowNull: true,
  },
}, {
  tableName: 'expense_splits',
  timestamps: false,
});

module.exports = ExpenseSplit;
