const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  paid_by_user_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  paid_by_guest_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  settled_to_user_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  settled_to_guest_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  original_amount: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
  },
  base_currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR',
  },
  exchange_rate_to_base: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: false,
    defaultValue: 1.0,
  },
  conversion_timestamp: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  exchange_rate_source: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  split_type: {
    type: DataTypes.ENUM('equal', 'unequal', 'percentage', 'share'),
    allowNull: false,
    defaultValue: 'equal',
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  notes: {
    type: DataTypes.TEXT,
  },
  is_settlement: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'pending_approval', 'rejected'),
    defaultValue: 'active',
  },
}, {
  tableName: 'expenses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      name: 'idx_expenses_group_date',
      fields: ['group_id', 'date']
    }
  ]
});

module.exports = Expense;
