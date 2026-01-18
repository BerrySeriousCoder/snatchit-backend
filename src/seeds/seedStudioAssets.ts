/**
 * Seed script for Virtual Photo Studio
 * Seeds: Stock Poses, Scene Presets, Lighting Presets
 * 
 * Run: bun run src/seeds/seedStudioAssets.ts
 */

import { db } from '../db';
import { studioPoses, studioScenePresets, studioLightingPresets } from '../db/schema';
import { uploadFile } from '../storage';
import fs from 'fs';
import path from 'path';

const POSES_DIR = path.join(__dirname, '../../assets/poses');

// Pose definitions with categories
const STOCK_POSES = [
    { filename: 'Dynamic Mid-Air Pose.png', name: 'Dynamic Mid-Air', category: 'action' },
    { filename: 'cute pose.png', name: 'Cute Pose', category: 'casual' },
    { filename: 'handstand.png', name: 'Handstand', category: 'action' },
    { filename: 'hip hop.png', name: 'Hip Hop', category: 'casual' },
    { filename: 'over the sholuder.png', name: 'Over the Shoulder', category: 'editorial' },
    { filename: 's curve.png', name: 'S Curve', category: 'standing' },
    { filename: 'squatpose.png', name: 'Squat Pose', category: 'casual' },
];

// Scene presets (prompt-based)
const SCENE_PRESETS = [
    { name: 'White Studio', prompt: 'clean white photography studio backdrop, professional lighting, seamless white background', category: 'studio', sortOrder: 1 },
    { name: 'Grey Studio', prompt: 'neutral grey studio backdrop, professional photography setup, even lighting', category: 'studio', sortOrder: 2 },
    { name: 'Black Void', prompt: 'pure black background, dramatic studio lighting, dark elegant', category: 'studio', sortOrder: 3 },
    { name: 'Urban Street', prompt: 'urban city street background, modern architecture, daytime, natural light', category: 'outdoor', sortOrder: 4 },
    { name: 'Beach Sunset', prompt: 'tropical beach at sunset, golden hour lighting, ocean waves, warm tones', category: 'outdoor', sortOrder: 5 },
    { name: 'Park Garden', prompt: 'lush green park, natural sunlight filtering through trees, flowers, nature', category: 'outdoor', sortOrder: 6 },
    { name: 'Rooftop City', prompt: 'city rooftop view, urban skyline, modern architecture, dramatic sky', category: 'outdoor', sortOrder: 7 },
    { name: 'Minimalist Interior', prompt: 'minimalist modern interior, clean lines, soft natural lighting, white walls', category: 'interior', sortOrder: 8 },
    { name: 'Luxury Showroom', prompt: 'luxury fashion showroom, marble floors, elegant lighting, high-end retail', category: 'interior', sortOrder: 9 },
    { name: 'Abstract Gradient', prompt: 'abstract colorful gradient background, vibrant colors, artistic, modern', category: 'abstract', sortOrder: 10 },
];

// Lighting presets (prompt-based)
const LIGHTING_PRESETS = [
    { name: 'Natural Daylight', prompt: 'soft natural daylight, diffused even lighting, no harsh shadows', sortOrder: 1 },
    { name: 'Studio Softbox', prompt: 'professional studio lighting, soft shadows, three-point lighting setup', sortOrder: 2 },
    { name: 'Dramatic Rim', prompt: 'dramatic rim lighting, dark moody shadows, edge lit, cinematic', sortOrder: 3 },
    { name: 'Golden Hour', prompt: 'warm golden hour sunlight, soft orange glow, romantic atmosphere', sortOrder: 4 },
    { name: 'High Key', prompt: 'bright high-key lighting, minimal shadows, clean and airy', sortOrder: 5 },
    { name: 'Low Key', prompt: 'low key dramatic lighting, deep shadows, high contrast, mysterious', sortOrder: 6 },
    { name: 'Flash', prompt: 'direct editorial flash photography, high contrast, sharp, fashion magazine style', sortOrder: 7 },
    { name: 'Neon Glow', prompt: 'colorful neon lighting, cyberpunk aesthetic, vibrant pink and blue tones', sortOrder: 8 },
];

async function seedPoses() {
    console.log('🧍 Seeding poses...');

    for (const pose of STOCK_POSES) {
        const filePath = path.join(POSES_DIR, pose.filename);

        if (!fs.existsSync(filePath)) {
            console.log(`  ⚠️  File not found: ${pose.filename}`);
            continue;
        }

        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        const mimeType = pose.filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

        // Upload to R2
        const r2Key = `studio/stock/poses/${pose.filename.replace(/\s/g, '-').toLowerCase()}`;
        const r2Url = await uploadFile(fileBuffer, r2Key, mimeType);

        // Insert into DB
        await db.insert(studioPoses).values({
            name: pose.name,
            category: pose.category,
            thumbnailUrl: r2Url,
            controlImageUrl: r2Url,
            isStock: true,
        });

        console.log(`  ✅ ${pose.name}`);
    }
}

async function seedScenePresets() {
    console.log('🏞️  Seeding scene presets...');

    for (const scene of SCENE_PRESETS) {
        await db.insert(studioScenePresets).values({
            name: scene.name,
            prompt: scene.prompt,
            category: scene.category,
            sortOrder: scene.sortOrder,
        });
        console.log(`  ✅ ${scene.name}`);
    }
}

async function seedLightingPresets() {
    console.log('💡 Seeding lighting presets...');

    for (const lighting of LIGHTING_PRESETS) {
        await db.insert(studioLightingPresets).values({
            name: lighting.name,
            prompt: lighting.prompt,
            sortOrder: lighting.sortOrder,
        });
        console.log(`  ✅ ${lighting.name}`);
    }
}

async function main() {
    console.log('🎬 Starting Virtual Photo Studio seeding...\n');

    try {
        await seedPoses();
        console.log('');
        await seedScenePresets();
        console.log('');
        await seedLightingPresets();

        console.log('\n✅ Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

main();
