import { z } from 'zod';

// Valid aspect ratios for user images
const VALID_ASPECT_RATIOS = ['9:16', '2:3', '3:4', '4:5'] as const;

// ISO 8601 date string validator
const isoDateString = z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
}, { message: 'Invalid ISO date string' });

export const Schemas = {
    // UUID param validator (reusable)
    userIdParam: z.object({
        params: z.object({
            userId: z.string().uuid('Invalid User ID format'),
        }),
    }),

    // lookId param validator
    lookIdParam: z.object({
        params: z.object({
            lookId: z.string().uuid('Invalid Look ID format'),
        }),
    }),

    // imageId param validator
    imageIdParam: z.object({
        params: z.object({
            userId: z.string().uuid('Invalid User ID format'),
            imageId: z.string().uuid('Invalid Image ID format'),
        }),
    }),

    // Feed pagination validator (with max page)
    feedPagination: z.object({
        query: z.object({
            type: z.enum(['global', 'friends']).optional(),
            page: z.coerce.number().min(1).max(1000).optional(),
            limit: z.coerce.number().min(1).max(50).optional(),
        }),
    }),

    // Cursor pagination validator
    cursorPagination: z.object({
        query: z.object({
            cursor: isoDateString.optional(),
            limit: z.coerce.number().min(1).max(50).optional(),
        }),
    }),

    // User creation with proper validation
    createUser: z.object({
        body: z.object({
            phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional().or(z.literal('')),
            name: z.string().max(100).optional(),
            aspectRatio: z.enum(VALID_ASPECT_RATIOS).optional(),
        }),
    }),

    // User images upload validation
    uploadUserImage: z.object({
        params: z.object({
            userId: z.string().uuid('Invalid User ID format'),
        }),
        body: z.object({
            aspectRatio: z.enum(VALID_ASPECT_RATIOS).optional(),
            isActive: z.enum(['true', 'false']).optional(),
        }),
    }),

    // Link parsing
    parseLink: z.object({
        body: z.object({
            url: z.string().url('Invalid product URL'),
        }),
    }),

    // Image generation
    generate: z.object({
        body: z.object({
            userId: z.string().uuid('Invalid User ID'),
            productUrl: z.string().url().optional(),
            productName: z.string().min(1, 'Product name is required'),
            productImageUrls: z.array(z.string().url()).min(1, 'At least one product image is required'),
        }),
    }),

    // Social actions - userId now comes from auth token, not body
    react: z.object({
        body: z.object({
            type: z.enum(['heart', 'fire', 'ice', 'skull', 'cap']),
        }),
    }),

    privacy: z.object({
        body: z.object({
            isPublic: z.boolean(),
        }),
    }),

    // Save look
    saveLook: z.object({
        body: z.object({
            userId: z.string().uuid('Invalid User ID'),
            productUrl: z.string().url().optional(),
            productName: z.string().max(500).optional(),
            productImageUrl: z.string().url().optional(),
            generatedImageUrl: z.string().min(1, 'Generated image URL is required'),
        }),
    }),

    // Profile update
    updateProfile: z.object({
        body: z.object({
            name: z.string().max(50).optional(),
            username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
            bio: z.string().max(150).optional(),
        }),
    }),

    // Outfit Mode: Generate with optional outfit context
    generateWithOutfit: z.object({
        body: z.object({
            userId: z.string().uuid('Invalid User ID'),
            productUrl: z.string().url().optional(),
            productName: z.string().min(1, 'Product name is required'),
            productImageUrls: z.array(z.string().url()).min(1, 'At least one product image is required'),
            // Outfit mode parameters
            outfitId: z.string().uuid('Invalid Outfit ID').optional(),
            baseImageUrl: z.string().url('Invalid base image URL').optional(),
            stepOrder: z.number().int().min(1).optional(),
        }),
    }),

    // Outfit Mode: Create new outfit
    createOutfit: z.object({
        body: z.object({
            userId: z.string().uuid('Invalid User ID'),
            name: z.string().max(100).optional(),
        }),
    }),

    // Outfit ID param validator
    outfitIdParam: z.object({
        params: z.object({
            outfitId: z.string().uuid('Invalid Outfit ID format'),
        }),
    }),

    // User outfits pagination
    userOutfitsPagination: z.object({
        params: z.object({
            userId: z.string().uuid('Invalid User ID format'),
        }),
        query: z.object({
            page: z.coerce.number().min(1).max(1000).optional(),
            limit: z.coerce.number().min(1).max(50).optional(),
        }),
    }),

    // Waitlist submission
    waitlistSubmit: z.object({
        body: z.object({
            email: z.string().email('Invalid email format'),
            platform: z.enum(['ios', 'android']),
        }),
    }),

    // Waitlist OTP verification
    waitlistVerify: z.object({
        body: z.object({
            email: z.string().email('Invalid email format'),
            code: z.string().length(6, 'Verification code must be 6 digits'),
        }),
    }),
};
