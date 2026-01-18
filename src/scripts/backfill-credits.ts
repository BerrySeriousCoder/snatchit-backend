/**
 * Backfill script to set credits to 3 for all existing users
 * Run with: npx tsx src/scripts/backfill-credits.ts
 */

import '../env';
import { db } from '../db';
import { users } from '../db/schema';

async function backfillCredits() {
    console.log('🔄 Backfilling credits to all existing users...');

    try {
        const result = await db.update(users)
            .set({ credits: 3 })
            .returning({ id: users.id, email: users.email });

        console.log(`✅ Updated ${result.length} users with 3 credits`);

        // Show first few for verification
        result.slice(0, 5).forEach(u => {
            console.log(`  - ${u.email || u.id}`);
        });

        if (result.length > 5) {
            console.log(`  ... and ${result.length - 5} more`);
        }

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

backfillCredits();
