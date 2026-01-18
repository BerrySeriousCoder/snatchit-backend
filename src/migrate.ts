require('dotenv').config();

const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');
const postgres = require('postgres');

async function runMigrations() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ DATABASE_URL environment variable is required');
        console.error('Usage: DATABASE_URL="your_connection_string" npm run db:migrate');
        process.exit(1);
    }

    console.log('🔄 Connecting to database...');

    const migrationClient = postgres(connectionString, { max: 1, ssl: 'require' });
    const db = drizzle(migrationClient);

    console.log('🔄 Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });

    await migrationClient.end();

    console.log('✅ Migrations completed successfully!');
}

runMigrations().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
