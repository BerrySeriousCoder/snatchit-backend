/**
 * Backfill script to add baseImageUrl to existing looks
 * Links looks to the user's first gallery image
 */
import '../env';
import { db } from '../db';
import { looks, userImages, users } from '../db/schema';
import { eq, isNull } from 'drizzle-orm';

async function backfillBaseImages() {
    console.log('🔄 Starting backfill of baseImageUrl for existing looks...\n');

    // Get all looks without baseImageUrl
    const looksToUpdate = await db.select({
        id: looks.id,
        userId: looks.userId,
    })
        .from(looks)
        .where(isNull(looks.baseImageUrl));

    console.log(`📊 Found ${looksToUpdate.length} looks without baseImageUrl\n`);

    if (looksToUpdate.length === 0) {
        console.log('✅ No looks to update!');
        process.exit(0);
    }

    // Get unique user IDs
    const userIds = [...new Set(looksToUpdate.map(l => l.userId))];
    console.log(`👥 Processing ${userIds.length} users\n`);

    let updated = 0;
    let skipped = 0;

    for (const userId of userIds) {
        // Get user's first gallery image (or active image)
        const userImage = await db.query.userImages.findFirst({
            where: eq(userImages.userId, userId),
            orderBy: (userImages, { desc }) => [desc(userImages.isActive), desc(userImages.createdAt)],
        });

        if (!userImage) {
            // Fallback: try to get user's body photo
            const user = await db.query.users.findFirst({
                where: eq(users.id, userId),
            });

            if (user?.bodyPhotoUrl) {
                // Update all looks for this user with their body photo
                const userLookIds = looksToUpdate
                    .filter(l => l.userId === userId)
                    .map(l => l.id);

                for (const lookId of userLookIds) {
                    await db.update(looks)
                        .set({ baseImageUrl: user.bodyPhotoUrl })
                        .where(eq(looks.id, lookId));
                    updated++;
                }
                console.log(`  ✅ ${user.name || userId}: Updated ${userLookIds.length} looks (from bodyPhotoUrl)`);
            } else {
                const count = looksToUpdate.filter(l => l.userId === userId).length;
                skipped += count;
                console.log(`  ⚠️ User ${userId}: No gallery image or body photo found (${count} looks skipped)`);
            }
            continue;
        }

        // Update all looks for this user with their gallery image
        const userLookIds = looksToUpdate
            .filter(l => l.userId === userId)
            .map(l => l.id);

        for (const lookId of userLookIds) {
            await db.update(looks)
                .set({ baseImageUrl: userImage.imageUrl })
                .where(eq(looks.id, lookId));
            updated++;
        }

        // Get user name for logging
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });
        console.log(`  ✅ ${user?.name || userId}: Updated ${userLookIds.length} looks`);
    }

    console.log('\n-------------------------------------------');
    console.log(`✅ Backfill complete!`);
    console.log(`   Updated: ${updated} looks`);
    console.log(`   Skipped: ${skipped} looks`);

    process.exit(0);
}

backfillBaseImages().catch(err => {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
});
