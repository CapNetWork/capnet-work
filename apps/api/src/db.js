const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://capnet:capnet_dev@localhost:5432/capnet",
});

module.exports = { pool };
