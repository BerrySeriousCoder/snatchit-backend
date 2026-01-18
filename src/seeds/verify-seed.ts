
import '../env';
import { db } from '../db';
import { users, looks, userImages } from '../db/schema';
import { sql, eq } from 'drizzle-orm';

async function verifySeed() {
    console.log('🔍 Verifying seed data...');

    const allUsers = await db.select().from(users);
    console.log(`\n👥 Total Users: ${allUsers.length}`);

    for (const user of allUsers) {
        console.log(`\n👤 User: ${user.name} (@${user.username})`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Bio: ${user.bio}`);
        console.log(`   Profile Photo: ${user.profilePhotoUrl}`);

        // Check Gallery
        const galleryImages = await db.select().from(userImages).where(eq(userImages.userId, user.id));
        console.log(`   🖼️  Gallery Images: ${galleryImages.length}`);
        galleryImages.forEach(img => {
            console.log(`      - ${img.imageUrl} (Ratio: ${img.aspectRatio})`);
        });

        // Check Looks
        const userLooks = await db.select().from(looks).where(eq(looks.userId, user.id));
        console.log(`   👗 Generated Looks: ${userLooks.length}`);
        userLooks.forEach(look => {
            console.log(`      - ${look.generatedImageUrl} (Product: ${look.productName})`);
        });
    }

    if (allUsers.length === 8) {
        console.log('\n✅ SUCCESS: 8 Users found.');
    } else {
        console.log(`\n⚠️  WARNING: Expected 8 users, found ${allUsers.length}.`);
    }

    process.exit(0);
}

verifySeed();
