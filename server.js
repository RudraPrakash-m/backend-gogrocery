const app = require('./app');
const config = require('./config');
const mongoose = require('mongoose');

// Mongoose connection options to fix IPv6 / SSL handshake issues on Node 20+
const mongooseOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4 // Force IPv4 to prevent IPv6 DNS delay and SSL handshake timeouts
};

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri, mongooseOptions);
    console.log('MongoDB Connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Retrying MongoDB connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected! Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully!');
});

// Initial Connection
connectDB();

// Start Server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
});
