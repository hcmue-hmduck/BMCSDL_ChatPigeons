const { Pool } = require('pg');
const mongoose = require('mongoose');
require('dotenv').config();

// PostgreSQL pool
const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // ssl: {
    //     rejectUnauthorized: false
    // }
    ssl: false
});

async function connectToDB() {
    let pgConnected = false;
    let mongoConnected = false;

    // Kết nối PostgreSQL
    try {
        await pgPool.query('SELECT 1');
        pgConnected = true;
        console.log('PostgreSQL connected successfully.');
    } catch (err) {
        console.error('PostgreSQL connection error:', err.message, '\nPOSTGRES_URL:', process.env.POSTGRES_URL);
    }

    // Kết nối MongoDB
    try {
        if (!process.env.MONGO_URL) {
            console.warn('MONGO_URL is not defined in .env');
        } else {
            await mongoose.connect(process.env.MONGO_URL);
            mongoConnected = true;
            console.log('MongoDB connected successfully.');
        }
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
    }

    // Kiểm tra kết quả
    if (!pgConnected) {
        throw new Error('Failed to connect to PostgreSQL.');
    }

    if (mongoConnected) {
        console.log('All databases connected successfully.');
    } else {
        console.warn('Database connected with PostgreSQL only (MongoDB failed).');
    }
}

module.exports = {
    pgPool,
    connectToDB,
    mongoose,
};