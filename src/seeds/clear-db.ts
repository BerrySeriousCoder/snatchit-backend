import '../env';
import { db } from '../db';
import { users, looks, userImages, follows, reactions, outfits, outfitGenerations, waitlist, studioProjects, studioAssets, studioGenerations, studioGenerationChain, userModels } from '../db/schema';
import { sql } from 'drizzle-orm';

async function clearDatabase() {
    console.log('⚠️  Starting database cleanup...');
    console.log('⚠️  This will delete ALL user data!');

    try {
        // We can just delete users, and cascade should handle the rest for related tables
        // But to be safe and thorough, we'll delete from child tables first where possible or just rely on cascade if configured.
        // Looking at schema.ts, most have onDelete: 'cascade'.

        // Let's verify what tables depend on users:
        // looks, userImages, follows (follower/following), reactions, outfits, studioProjects, studioAssets, studioGenerations, userModels, studioGenerationChain

        // outfitGenerations depends on outfits (cascade)
        // studioAssets, studioGenerations, userModels, studioGenerationChain depend on studioProjects (cascade) or users (cascade)

        console.log('🗑️  Deleting all users (and cascading data)...');
        await db.delete(users);

        // Also clear waitlist if desired? The user said "drop all the user first thier related data".
        // Waitlist is technically user data but pre-signup. I'll leave it unless specified, 
        // but usually "fresh start" implies clearing everything. 
        // However, the prompt said "drop all the user... we gonna seed some fresh data".
        // I will clear waitlist too to be safe, or maybe just users. 
        // "drop all the user first thier related data" -> implies registered users.
        // I'll stick to `users` table and its cascades for now. 

        console.log('✅ Users table cleared.');

        // Verify count
        const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
        console.log(`Current user count: ${userCount[0].count}`);

    } catch (error) {
        console.error('❌ Error clearing database:', error);
        process.exit(1);
    }

    console.log('🎉 Database cleared successfully!');
    process.exit(0);
}

clearDatabase();
