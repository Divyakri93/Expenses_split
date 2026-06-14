const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GroupMember = sequelize.define('GroupMember', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  joined_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  left_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('admin', 'member'),
    defaultValue: 'member',
    allowNull: false,
  }
}, {
  tableName: 'group_members',
  timestamps: false,
});

module.exports = GroupMember;
