const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Use PostgreSQL in Production/Render
  const isInternal = process.env.DATABASE_URL.includes('dpg-') && !process.env.DATABASE_URL.includes('.onrender.com');
  const dialectOptions = isInternal ? {} : {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
  };

  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions,
    logging: false
  });
} else {
  // Fallback to SQLite locally
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false,
  });
}

module.exports = sequelize;
