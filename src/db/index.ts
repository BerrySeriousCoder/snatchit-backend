import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Create postgres client
const client = postgres(connectionString, {
    ssl: 'require',
    max: 10,
    idle_timeout: 30,
    connect_timeout: 30,
    max_lifetime: 60 * 30,
    prepare: false, // CRITICAL: Disable prepared statements for Neon pooling compatibility
});

// Create drizzle instance
export const db = drizzle(client, { schema });

console.log('✅ Drizzle ORM initialized');
