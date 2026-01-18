/**
 * Script to add credits to a specific user
 * Usage: npx tsx src/scripts/add-credits.ts
 */

import 'dotenv/config';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

async function addCreditsToUser() {
    const username = 'harsh_vardhan_s';
    const creditsToAdd = 10;

    console.log(`🔄 Adding ${creditsToAdd} credits to @${username}...`);

    try {
        const result = await db.update(users)
            .set({
                credits: sql`${users.credits} + ${creditsToAdd}`,
            })
            .where(eq(users.username, username))
            .returning({
                id: users.id,
                username: users.username,
                credits: users.credits
            });

        if (result.length === 0) {
            console.log(`❌ User @${username} not found`);
            process.exit(1);
        }

        console.log(`✅ Added ${creditsToAdd} credits to @${username}`);
        console.log(`   New balance: ${result[0].credits} credits`);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }

    process.exit(0);
}

addCreditsToUser();
