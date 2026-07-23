// Run with: npm run seed-admin
// Creates the admin account, OR updates its password if it already exists — using
// ADMIN_USERNAME / ADMIN_PASSWORD from .env. Use this if you ever do get Shell/CLI
// access, or when running locally against a local copy of the database.
require('dotenv').config();
const { upsertAdmin } = require('../db/seedAdmin');

const result = upsertAdmin();
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
console.log(result.message);

