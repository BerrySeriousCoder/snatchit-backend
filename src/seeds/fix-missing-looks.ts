
import '../env';
import { db } from '../db';
import { users, looks } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { GenerationService } from '../modules/generation/generation.service';
import { uploadFile } from '../storage';
import { v4 as uuidv4 } from 'uuid';

// Initialize service
const generationService = new GenerationService();

const MODELS = [
    {
        name: 'Nova',
        username: 'super_nova_x',
        link: 'https://blnkstore.in/products/oversize-onion-pink-printed-tshirt-3?variant=50713413943609&country=IN&currency=INR',
    },
];

async function fixMissingLooks() {
    console.log('🔧 Starting fix for missing looks...');

    for (const model of MODELS) {
        try {
            console.log(`\n👤 Checking ${model.name} (${model.username})...`);

            // Find user
            const user = await db.query.users.findFirst({
                where: eq(users.username, model.username),
            });

            if (!user) {
                console.error(`   ❌ User not found: ${model.username}`);
                continue;
            }

            // Check if look exists
            const existingLooks = await db.select().from(looks).where(eq(looks.userId, user.id));
            if (existingLooks.length > 0) {
                console.log(`   ✅ Look already exists for ${model.name}`);
                continue;
            }

            console.log(`   ⚠️  No look found. Generating now...`);

            // Parse link
            const parseResult = await generationService.parseProductLink(model.link);
            if (!parseResult.success || !parseResult.product) {
                console.error(`   ❌ Failed to parse link for ${model.name}`);
                continue;
            }

            const productImages = parseResult.product.imageUrls || [];
            if (productImages.length === 0) {
                console.error(`   ❌ No product images found for ${model.name}`);
                continue;
            }

            // Generate
            console.log('   Triggering AI generation...');
            const generationResult = await generationService.generateTryOn({
                userId: user.id,
                productUrl: model.link,
                productName: parseResult.product.name,
                productImageUrls: productImages.slice(0, 3),
            });

            if (generationResult.generatedImageBase64) {
                console.log('   ✅ Generation successful (Base64 received). Saving manually...');

                // Manually save to R2 and DB to ensure persistence
                const buffer = Buffer.from(generationResult.generatedImageBase64, 'base64');
                const fileName = `generated/${uuidv4()}.jpg`;
                const uploadedUrl = await uploadFile(buffer, fileName, 'image/jpeg', true);
                console.log(`   Uploaded to R2: ${uploadedUrl}`);

                await db.insert(looks).values({
                    userId: user.id,
                    productUrl: model.link,
                    productName: parseResult.product.name,
                    productImageUrl: productImages[0],
                    generatedImageUrl: uploadedUrl,
                    isPublic: true,
                });
                console.log(`   ✅ Look saved to DB!`);

            } else {
                console.error('   ❌ Generation returned no image data');
            }

        } catch (error) {
            console.error(`   ❌ Error processing ${model.name}:`, error);
        }
    }

    console.log('\n🎉 Fix completed!');
    process.exit(0);
}

fixMissingLooks().catch(console.error);
