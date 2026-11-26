// =============================================================
// db.js: connects to MongoDB and explains clearly if it is not running.
// =============================================================
// import mongoose from 'mongoose';

// export async function connectDb(uri) {
//   try {
//     await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
//   } catch (e) {
//     console.error('\nCould not connect to MongoDB at ' + uri.replace(/\/\/[^@/]*@/, '//***@'));
//     console.error('Reason: ' + e.message);
//     console.error('\nFix it with ONE of these:');
//     console.error('  1) Docker:  docker compose up -d mongo');
//     console.error('  2) Install MongoDB 7 locally and start it (port 27017)');
//     console.error('  3) Use a free MongoDB Atlas cluster and paste its URL into MONGO_URI in server/.env\n');
//     process.exit(1);
//   }
// }

import mongoose from 'mongoose';
export async function connectDb() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');

  // Reuse an existing connection when the server is initialized more than once.
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  return mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
}
