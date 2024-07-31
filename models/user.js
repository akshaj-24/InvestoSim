const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'users.sqlite') // Path to your SQLite database file
});

const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        primaryKey: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

module.exports = { sequelize, User };
