const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Initialize Sequelize
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'watchlist.sqlite') // Path to your SQLite database file
});

// Define the Purchase model
const Watchlist = sequelize.define('Watchlist', {
    symbol: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    }
});

// Sync database
sequelize.sync();

module.exports = { sequelize, Watchlist };
