const { readFileSync } = require("fs");
const { join } = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://capnet:capnet_dev@localhost:5432/capnet",
});

async function migrate() {
  const schema = readFileSync(
    join(__dirname, "schema.sql"),
    "utf-8"
  );
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log("Migration complete — schema applied.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
