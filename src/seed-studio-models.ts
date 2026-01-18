/**
 * Seed Studio Models
 * 
 * This script uploads model images to R2 and seeds the database with initial models.
 * Run with: npx tsx src/seed-studio-models.ts
 */

import './env';
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { studioModels, studioModelImages } from './db/schema';
import { uploadFile } from './storage';
import { authorize } from './storage';

const MODELS_DATA = [
    {
        name: 'Sophia',
        ethnicity: 'Caucasian',
        gender: 'female' as const,
        imagePath: '../../snatchedstudio/public/sophia.png',
    },
    {
        name: 'Marcus',
        ethnicity: 'African American',
        gender: 'male' as const,
        imagePath: '../../snatchedstudio/public/marcus.png',
    },
    {
        name: 'Aiko',
        ethnicity: 'Asian',
        gender: 'female' as const,
        imagePath: '../../snatchedstudio/public/aiko.png',
    },
];

async function seedModels() {
    console.log('🚀 Starting Studio Models seed...');

    // Initialize storage
    await authorize();
    console.log('✅ Storage authorized');

    for (const modelData of MODELS_DATA) {
        console.log(`\n📦 Processing model: ${modelData.name}`);

        // Read the image file
        const imagePath = path.resolve(__dirname, modelData.imagePath);

        if (!fs.existsSync(imagePath)) {
            console.error(`❌ Image not found: ${imagePath}`);
            continue;
        }

        const imageBuffer = fs.readFileSync(imagePath);
        console.log(`   Read image: ${imageBuffer.length} bytes`);

        // Upload to R2
        const fileName = `studio-models/${modelData.name.toLowerCase()}_front.png`;
        const r2Url = await uploadFile(imageBuffer, fileName, 'image/png');
        console.log(`   Uploaded to R2: ${r2Url}`);

        // Insert model
        const [model] = await db.insert(studioModels).values({
            name: modelData.name,
            ethnicity: modelData.ethnicity,
            gender: modelData.gender,
            isActive: true,
        }).returning();
        console.log(`   Created model: ${model.id}`);

        // Insert model image
        const [modelImage] = await db.insert(studioModelImages).values({
            modelId: model.id,
            url: r2Url,
            angle: 'front',
            isPrimary: true,
        }).returning();
        console.log(`   Created model image: ${modelImage.id}`);

        console.log(`✅ ${modelData.name} seeded successfully`);
    }

    console.log('\n🎉 All models seeded successfully!');
    process.exit(0);
}

seedModels().catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
});
