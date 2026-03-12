const { readFileSync, readdirSync } = require("fs");
const { join } = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://capnet:capnet_dev@localhost:5432/capnet",
});

async function migrate() {
  const client = await pool.connect();
  try {
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    await client.query(schema);
    console.log("Schema applied.");

    const migrationsDir = join(__dirname, "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await client.query(sql);
      console.log(`Migration applied: ${file}`);
    }
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
