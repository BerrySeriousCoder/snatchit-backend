/**
 * Environment Configuration
 * 
 * This file MUST be imported first in server.ts to ensure
 * environment variables are loaded before any other modules
 * attempt to access them.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file from backend root directory
// Use process.cwd() instead of __dirname to work correctly with tsx/ts-node
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

console.log('✅ Environment variables loaded from:', envPath);

// Validate required environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'GEMINI_API_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'SCRAPEAPI',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'GOOGLE_CLOUD_PROJECT_ID',
    'GOOGLE_CLOUD_REGION',
];

const missingVars: string[] = [];

for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        missingVars.push(varName);
    }
}

if (missingVars.length > 0) {
    console.warn('⚠️  WARNING: Missing environment variables:');
    missingVars.forEach(varName => console.warn(`   - ${varName}`));
    console.warn('\n📝 Some features may not work. Please update your .env file.');
    console.warn('   Reference: .env.example\n');
} else {
    console.log('✅ All required environment variables are present\n');
}
