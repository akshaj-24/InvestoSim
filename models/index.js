const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Initialize Sequelize
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'database.sqlite') // Path to your SQLite database file
});

// Define the Purchase model
const Purchase = sequelize.define('Purchase', {
    symbol: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

// Sync database
sequelize.sync();

module.exports = { sequelize, Purchase };
