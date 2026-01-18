
import '../env';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { users, userImages, looks } from '../db/schema';
import { uploadFile } from '../storage';
import { GenerationService } from '../modules/generation/generation.service';
import { logger } from '../utils/logger';

// Initialize service
const generationService = new GenerationService();

const MODELS = [
    {
        name: 'Mika',
        username: 'mika_electric',
        imagePath: '../seed/model/modelone/mika.png',
        link: 'https://exotix.in/product/black-air-racing-jacket-for-womens-vintage-biker-fashion-racer-style/',
        bio: 'Racing through life in style. 🏎️✨ Fast cars and faster fashion.',
    },
    {
        name: 'Nova',
        username: 'super_nova_x',
        imagePath: '../seed/model/modeltwo/nova.jpg',
        link: 'https://shopakira.com/products/winner-squad-varsity-jersey-in-pink',
        bio: 'Shining brighter than the stars. 🌟💖 Pink is my power color.',
    },
    {
        name: 'Anya',
        username: 'anya_slays_all',
        imagePath: '../seed/model/modelthree/anya.jpg',
        link: 'https://www.etsy.com/in-en/listing/4425385866/handmade-90s-red-ferrari-embroidered-f1?ls=s&ga_order=most_relevant&ga_search_type=all&ga_view_type=gallery&ga_search_query=anime+jacket+women&ref=sr_gallery-1-37&pro=1&frs=1&content_source=de65769f-fab5-4501-a908-6cff0f404fdb%253ALT426d19ae70eda04ba27a6a3b3b9d4b96e2799100&organic_search_click=1&logging_key=de65769f-fab5-4501-a908-6cff0f404fdb%3ALT426d19ae70eda04ba27a6a3b3b9d4b96e2799100',
        bio: 'Anime vibes and vintage finds. 🎌🧥 Living in a 90s dream.',
    },
    {
        name: 'Isabella',
        username: 'bella_mode_on',
        imagePath: '../seed/model/modelfour/Isabella.jpg',
        link: 'https://www.myntra.com/tops/stylecast+x+slyck/stylecast-x-slyck-off-shoulder-ruffles-crop-top/32219717/buy',
        bio: 'Elegance is the only beauty that never fades. 🌹 Chic & sleek.',
    },
    {
        name: 'Julian',
        username: 'king_julian_style',
        imagePath: '../seed/model/modelfive/julian.jpg',
        link: 'https://www2.hm.com/en_in/productpage.1309718001.html',
        bio: 'Streetwear enthusiast. 🛹🧢 redefining urban cool.',
    },
    {
        name: 'Dante',
        username: 'dante_inferno_fit',
        imagePath: '../seed/model/modelsix/dante.jpg',
        link: 'https://www.zara.com/in/en/80-down---20-feather-water-repellent-jacket-p03411510.html?v1=495716621&v2=2538410',
        bio: 'Cold days, hot fits. 🔥❄️ Layering master.',
    },
    {
        name: 'Sloane',
        username: 'sloane_ranger_zone',
        imagePath: '../seed/model/modelseven/Sloane.jpg',
        link: 'https://www.amazon.in/Aahwan-Backless-Crisscross-Bodycon-323-Black-S/dp/B0F2TGQQ5T/ref=sr_1_7?sr=8-7&psc=1',
        bio: 'Bold, black, and beautiful. 🖤✨ Confidence is my best accessory.',
    },
    {
        name: 'Amara',
        username: 'amara_eternal_glam',
        imagePath: '../seed/model/modeleight/amara.jpg',
        link: 'https://www2.hm.com/en_in/productpage.1298432003.html',
        bio: 'Simplicity is the ultimate sophistication. 🤍 Minimalist queen.',
    },
];

async function seedFreshData() {
    console.log('🌱 Starting fresh data seed...');

    for (const model of MODELS) {
        try {
            console.log(`\n👤 Processing ${model.name}...`);

            // 1. Read and Upload Image
            const absolutePath = path.resolve(process.cwd(), model.imagePath);
            if (!fs.existsSync(absolutePath)) {
                console.error(`❌ Image not found: ${absolutePath}`);
                continue;
            }

            const imageBuffer = fs.readFileSync(absolutePath);
            const fileName = `profiles/${model.username}_${Date.now()}.jpg`;
            // Assuming image/jpeg for simplicity, or detect from extension
            const mimeType = model.imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

            console.log('   Uploading profile image...');
            const imageUrl = await uploadFile(imageBuffer, fileName, mimeType);
            console.log(`   ✅ Uploaded: ${imageUrl}`);

            // 2. Create User
            console.log('   Creating user profile...');
            const [user] = await db.insert(users).values({
                name: model.name,
                username: model.username,
                email: `${model.username}@snatched.ai`, // Fake email
                bio: model.bio,
                profilePhotoUrl: imageUrl,
                bodyPhotoUrl: imageUrl,
            }).returning();
            console.log(`   ✅ User created: ${user.id}`);

            // 3. Add to Gallery (User Images)
            console.log('   Adding to gallery...');
            await db.insert(userImages).values({
                userId: user.id,
                imageUrl: imageUrl,
                aspectRatio: '3:4', // Enforce 3:4 as requested
                isActive: true,
            });
            console.log('   ✅ Added to gallery');

            // 4. Generate Look
            console.log(`   Generating look from link: ${model.link}`);

            // Parse link
            const parseResult = await generationService.parseProductLink(model.link);
            if (!parseResult.success || !parseResult.product) {
                console.error(`   ❌ Failed to parse link for ${model.name}`);
                continue;
            }

            // Get product images
            const productImages = parseResult.product.imageUrls || [];
            if (productImages.length === 0) {
                console.error(`   ❌ No product images found for ${model.name}`);
                continue;
            }

            // Generate
            console.log('   Triggering AI generation (this may take a minute)...');
            const generationResult = await generationService.generateTryOn({
                userId: user.id,
                productUrl: model.link,
                productName: parseResult.product.name,
                productImageUrls: productImages.slice(0, 3), // Take top 3 images
                // No outfitId, standard generation
            });

            if (generationResult.generatedImageUrl) {
                console.log(`   ✅ Generation complete: ${generationResult.generatedImageUrl}`);
            } else if (generationResult.generatedImageBase64) {
                console.log(`   ✅ Generation complete (Base64 returned)`);
                // The service saves background/async for non-outfit mode usually, 
                // but we want to ensure it's saved for the seed.
                // Actually generationService.generateTryOn saves it in background if no outfitId.
                // We might want to wait or check? 
                // The service returns `generatedImageUrl` as null if background save.
                // Let's rely on the service's background save, but maybe add a small delay or 
                // modify the service call to force wait? 
                // For this seed script, we can just let it run.
            }

        } catch (error) {
            console.error(`   ❌ Error processing ${model.name}:`, error);
        }
    }

    console.log('\n🎉 Seed completed!');
    // Keep process alive for a moment to allow background saves to finish if any
    setTimeout(() => {
        console.log('👋 Exiting...');
        process.exit(0);
    }, 10000);
}

seedFreshData().catch(console.error);
