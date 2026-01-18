import { pgTable, uuid, text, varchar, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    bodyPhotoUrl: text('body_photo_url'),
    profilePhotoUrl: text('profile_photo_url'),
    phone: text('phone').unique(),
    googleId: text('google_id').unique(),
    email: text('email').unique(),
    name: text('name'),
    username: varchar('username', { length: 20 }).unique(),
    bio: varchar('bio', { length: 150 }),
    usernameChangedAt: timestamp('username_changed_at'),
    streakCurrent: integer('streak_current').default(0).notNull(),
    lastSnatchAt: timestamp('last_snatch_at'),
    credits: integer('credits').default(3).notNull(),
    plan: text('plan', { enum: ['free', 'basic', 'premium', 'business'] }).default('free').notNull(),
    planPurchasedAt: timestamp('plan_purchased_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        usernameIdx: index('username_idx').on(table.username),
    };
});

export const looks = pgTable('looks', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    productUrl: text('product_url'),
    productName: text('product_name'),
    productImageUrl: text('product_image_url'),
    generatedImageUrl: text('generated_image_url'),
    baseImageUrl: text('base_image_url'),  // Original user photo used for generation
    isPublic: boolean('is_public').default(true).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        isPublicIdx: index('is_public_idx').on(table.isPublic),
        userIdIdx: index('user_id_idx').on(table.userId),
        createdAtIdx: index('created_at_idx').on(table.createdAt),
        userPublicIdx: index('user_public_idx').on(table.userId, table.isPublic),
    };
});

export const userImages = pgTable('user_images', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    imageUrl: text('image_url').notNull(),
    aspectRatio: text('aspect_ratio').default('3:4').notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('user_images_user_id_idx').on(table.userId),
    };
});

export const follows = pgTable('follows', {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    followingId: uuid('following_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        followerIdx: index('follower_idx').on(table.followerId),
        followingIdx: index('following_idx').on(table.followingId),
    };
});

export const reactions = pgTable('reactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    lookId: uuid('look_id').references(() => looks.id, { onDelete: 'cascade' }).notNull(),
    type: text('type', { enum: ['heart', 'fire', 'ice', 'skull', 'cap'] }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        lookIdIdx: index('reaction_look_id_idx').on(table.lookId),
        userIdIdx: index('reaction_user_id_idx').on(table.userId),
    };
});

// Outfit Mode: Groups multiple generations into a complete outfit
export const outfits = pgTable('outfits', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name'),
    isPublic: boolean('is_public').default(true).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('outfit_user_id_idx').on(table.userId),
        createdAtIdx: index('outfit_created_at_idx').on(table.createdAt),
    };
});

// Outfit Mode: Each step/generation in an outfit chain
export const outfitGenerations = pgTable('outfit_generations', {
    id: uuid('id').primaryKey().defaultRandom(),
    outfitId: uuid('outfit_id').references(() => outfits.id, { onDelete: 'cascade' }).notNull(),
    stepOrder: integer('step_order').notNull(),
    productUrl: text('product_url'),
    productName: text('product_name'),
    productImageUrl: text('product_image_url'),
    generatedImageUrl: text('generated_image_url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        outfitIdIdx: index('outfit_gen_outfit_id_idx').on(table.outfitId),
        stepOrderIdx: index('outfit_gen_step_order_idx').on(table.outfitId, table.stepOrder),
    };
});

// Credit Transactions: Audit trail for all credit changes
export const creditTransactions = pgTable('credit_transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: integer('amount').notNull(), // Positive = add, Negative = deduct
    type: text('type', { enum: ['signup_bonus', 'purchase', 'generation', 'refund'] }).notNull(),
    plan: text('plan'), // Plan purchased (if type = 'purchase')
    description: text('description'),
    lookId: uuid('look_id').references(() => looks.id, { onDelete: 'set null' }),
    outfitId: uuid('outfit_id').references(() => outfits.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('credit_tx_user_id_idx').on(table.userId),
        typeIdx: index('credit_tx_type_idx').on(table.type),
        createdAtIdx: index('credit_tx_created_at_idx').on(table.createdAt),
    };
});

// Purchase Intents: Track users who click on pricing plans (potential customers for outreach)
export const purchaseIntents = pgTable('purchase_intents', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    planId: text('plan_id', { enum: ['basic', 'premium', 'business'] }).notNull(),
    source: text('source'), // Where they clicked from: 'pricing_modal', 'download_locked', etc.
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('purchase_intent_user_id_idx').on(table.userId),
        planIdIdx: index('purchase_intent_plan_id_idx').on(table.planId),
        createdAtIdx: index('purchase_intent_created_at_idx').on(table.createdAt),
    };
});

// Waitlist: Store email signups with platform preference and demo usage
export const waitlist = pgTable('waitlist', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique().notNull(),
    platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
    generationsUsed: integer('generations_used').default(0).notNull(),
    lastImageUrl: text('last_image_url'),
    // Email verification fields
    verificationCode: varchar('verification_code', { length: 6 }),
    verificationCodeExpiresAt: timestamp('verification_code_expires_at'),
    isVerified: boolean('is_verified').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    emailIdx: index('waitlist_email_idx').on(table.email),
    platformIdx: index('waitlist_platform_idx').on(table.platform),
}));


// Snatched Studio Tables

export const studioProjects = pgTable('studio_projects', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    coverImageUrl: text('cover_image_url'),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('studio_project_user_id_idx').on(table.userId),
    };
});

export const studioAssets = pgTable('studio_assets', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => studioProjects.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    type: text('type', { enum: ['model', 'garment', 'background', 'mask', 'generated'] }).notNull(),
    url: text('url').notNull(),
    name: text('name'),
    metadata: text('metadata'), // JSON string for extra data (e.g., dimensions, tags)
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        projectIdIdx: index('studio_asset_project_id_idx').on(table.projectId),
        userIdIdx: index('studio_asset_user_id_idx').on(table.userId),
    };
});

export const studioGenerations = pgTable('studio_generations', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => studioProjects.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    inputAssets: text('input_assets'), // JSON string of asset IDs used
    outputUrl: text('output_url'),
    transparentUrl: text('transparent_url'), // Background-removed version cache
    status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).default('pending').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        projectIdIdx: index('studio_gen_project_id_idx').on(table.projectId),
        userIdIdx: index('studio_gen_user_id_idx').on(table.userId),
    };
});

// Studio Models: AI fashion models for try-on
export const studioModels = pgTable('studio_models', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ethnicity: text('ethnicity'),
    gender: text('gender', { enum: ['male', 'female', 'non-binary'] }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Studio Model Images: Multiple images per model (different angles)
export const studioModelImages = pgTable('studio_model_images', {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: uuid('model_id').references(() => studioModels.id, { onDelete: 'cascade' }).notNull(),
    url: text('url').notNull(),
    angle: text('angle'), // "front", "side", "back", "3/4"
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        modelIdIdx: index('studio_model_image_model_id_idx').on(table.modelId),
    };
});

// User-uploaded custom models for try-on
export const userModels = pgTable('user_models', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid('project_id').references(() => studioProjects.id, { onDelete: 'cascade' }).notNull(),
    name: text('name'),
    url: text('url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('user_model_user_id_idx').on(table.userId),
        projectIdIdx: index('user_model_project_id_idx').on(table.projectId),
    };
});

// ============ VIRTUAL PHOTO STUDIO TABLES ============

// Poses (stock + user uploaded)
export const studioPoses = pgTable('studio_poses', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // NULL = stock
    name: text('name').notNull(),
    category: text('category'), // standing, seated, walking, editorial
    thumbnailUrl: text('thumbnail_url'),
    controlImageUrl: text('control_image_url').notNull(), // For pose control
    isStock: boolean('is_stock').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('studio_pose_user_id_idx').on(table.userId),
    };
});

// Props (stock + user, image OR prompt)
export const studioProps = pgTable('studio_props', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // NULL = stock
    name: text('name').notNull(),
    category: text('category'), // seating, studio, accessories
    thumbnailUrl: text('thumbnail_url'),
    imageUrl: text('image_url'), // Optional
    promptText: text('prompt_text'), // Optional (at least one should exist)
    isStock: boolean('is_stock').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('studio_prop_user_id_idx').on(table.userId),
    };
});

// Scene presets (admin-defined)
export const studioScenePresets = pgTable('studio_scene_presets', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    category: text('category'), // studio, outdoor, abstract
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Lighting presets (admin-defined)
export const studioLightingPresets = pgTable('studio_lighting_presets', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Generation chain (undo/redo)
export const studioGenerationChain = pgTable('studio_generation_chain', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid('project_id').references(() => studioProjects.id, { onDelete: 'cascade' }).notNull(),
    parentStepId: uuid('parent_step_id'), // Previous step for chaining
    stepNumber: integer('step_number').default(1),
    // What was used
    sourceImageUrl: text('source_image_url'),
    poseId: uuid('pose_id').references(() => studioPoses.id),
    propId: uuid('prop_id').references(() => studioProps.id),
    scenePresetId: uuid('scene_preset_id').references(() => studioScenePresets.id),
    sceneCustom: text('scene_custom'),
    sceneReferenceUrl: text('scene_reference_url'),
    lightingPresetId: uuid('lighting_preset_id').references(() => studioLightingPresets.id),
    lightingCustom: text('lighting_custom'),
    garmentUrl: text('garment_url'),
    // Result
    outputUrl: text('output_url'),
    promptUsed: text('prompt_used'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index('gen_chain_user_id_idx').on(table.userId),
        projectIdIdx: index('gen_chain_project_id_idx').on(table.projectId),
    };
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Look = typeof looks.$inferSelect;
export type NewLook = typeof looks.$inferInsert;
export type UserImage = typeof userImages.$inferSelect;
export type NewUserImage = typeof userImages.$inferInsert;
export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;
export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
export type Outfit = typeof outfits.$inferSelect;
export type NewOutfit = typeof outfits.$inferInsert;
export type OutfitGeneration = typeof outfitGenerations.$inferSelect;
export type NewOutfitGeneration = typeof outfitGenerations.$inferInsert;
export type Waitlist = typeof waitlist.$inferSelect;
export type NewWaitlist = typeof waitlist.$inferInsert;
export type StudioProject = typeof studioProjects.$inferSelect;
export type NewStudioProject = typeof studioProjects.$inferInsert;
export type StudioAsset = typeof studioAssets.$inferSelect;
export type NewStudioAsset = typeof studioAssets.$inferInsert;
export type StudioGeneration = typeof studioGenerations.$inferSelect;
export type NewStudioGeneration = typeof studioGenerations.$inferInsert;
export type StudioModel = typeof studioModels.$inferSelect;
export type NewStudioModel = typeof studioModels.$inferInsert;
export type StudioModelImage = typeof studioModelImages.$inferSelect;
export type NewStudioModelImage = typeof studioModelImages.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
