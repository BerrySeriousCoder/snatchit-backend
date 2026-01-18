
import '../env';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { users, userImages, looks } from '../db/schema';
import { eq } from 'drizzle-orm';
import { uploadFile } from '../storage';
import { GenerationService } from '../modules/generation/generation.service';
import { v4 as uuidv4 } from 'uuid';

const generationService = new GenerationService();

const NOVA = {
    name: 'Nova',
    username: 'super_nova_x',
    imagePath: '../seed/model/modeltwo/nova.jpg',
    link: 'https://www.nykaafashion.com/rsvp-by-nykaa-fashion-black-solid-lapel-collar-knee-length-leather-overcoat/p/16786757?adsource=shopping_india&skuId=16786735&gad_campaignid=22067988239',
};

async function updateNova() {
    console.log('🔄 Updating Nova...');

    try {
        // 1. Find User
        const user = await db.query.users.findFirst({
            where: eq(users.username, NOVA.username),
        });

        if (!user) {
            console.error('❌ Nova not found!');
            process.exit(1);
        }
        console.log(`   ✅ Found user: ${user.id}`);

        // 2. Read and Upload New Image
        const absolutePath = path.resolve(process.cwd(), NOVA.imagePath);
        if (!fs.existsSync(absolutePath)) {
            console.error(`❌ Image not found: ${absolutePath}`);
            process.exit(1);
        }

        const imageBuffer = fs.readFileSync(absolutePath);
        const fileName = `profiles/${NOVA.username}_${Date.now()}.jpg`;
        console.log('   Uploading new profile image...');
        const imageUrl = await uploadFile(imageBuffer, fileName, 'image/jpeg');
        console.log(`   ✅ Uploaded: ${imageUrl}`);

        // 3. Update User Profile
        await db.update(users)
            .set({
                profilePhotoUrl: imageUrl,
                bodyPhotoUrl: imageUrl,
            })
            .where(eq(users.id, user.id));
        console.log('   ✅ Updated user profile');

        // 4. Update Gallery (Delete old, Add new)
        await db.delete(userImages).where(eq(userImages.userId, user.id));
        console.log('   🗑️  Deleted old gallery images');

        await db.insert(userImages).values({
            userId: user.id,
            imageUrl: imageUrl,
            aspectRatio: '3:4',
            isActive: true,
        });
        console.log('   ✅ Added new image to gallery');

        // 5. Generate Look
        console.log(`   Generating look from link: ${NOVA.link}`);

        // Parse link
        const parseResult = await generationService.parseProductLink(NOVA.link);
        if (!parseResult.success || !parseResult.product) {
            console.error(`   ❌ Failed to parse link`);
            process.exit(1);
        }

        const productImages = parseResult.product.imageUrls || [];
        if (productImages.length === 0) {
            console.error(`   ❌ No product images found`);
            process.exit(1);
        }

        // Generate
        console.log('   Triggering AI generation...');
        const generationResult = await generationService.generateTryOn({
            userId: user.id,
            productUrl: NOVA.link,
            productName: parseResult.product.name,
            productImageUrls: productImages.slice(0, 3),
        });

        if (generationResult.generatedImageBase64) {
            console.log('   ✅ Generation successful (Base64 received). Saving manually...');

            const buffer = Buffer.from(generationResult.generatedImageBase64, 'base64');
            const genFileName = `generated/${uuidv4()}.jpg`;
            const uploadedUrl = await uploadFile(buffer, genFileName, 'image/jpeg', true);
            console.log(`   Uploaded to R2: ${uploadedUrl}`);

            await db.insert(looks).values({
                userId: user.id,
                productUrl: NOVA.link,
                productName: parseResult.product.name,
                productImageUrl: productImages[0],
                generatedImageUrl: uploadedUrl,
                isPublic: true,
            });
            console.log(`   ✅ Look saved to DB!`);
        } else {
            // If background processing (which shouldn't happen if we wait, but just in case)
            console.log('   ⚠️  Generation started in background or returned URL directly.');
            if (generationResult.generatedImageUrl) {
                console.log(`   ✅ URL: ${generationResult.generatedImageUrl}`);
            }
        }

    } catch (error) {
        console.error('   ❌ Error:', error);
    }

    console.log('\n🎉 Update completed!');
    process.exit(0);
}

updateNova().catch(console.error);
