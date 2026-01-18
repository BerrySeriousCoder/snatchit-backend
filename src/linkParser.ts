import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './utils/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const SCRAPE_API_TOKEN = process.env.SCRAPEAPI;

export interface ProductInfo {
    name: string;
    imageUrls: string[];
    price: string;
    source: string;
    originalUrl: string;
}

export interface ParseResult {
    success: boolean;
    error?: string;
    product: ProductInfo;
    timing?: {
        scrapeMs: number;
        geminiMs: number;
        totalMs: number;
    };
    tokensUsed?: {
        input: number;
        output: number;
    };
}

// ==================== OUTFIT MODE IMAGE CLASSIFICATION ====================

export interface ImageClassification {
    url: string;
    type: 'product_only' | 'model_full_outfit' | 'unclear';
    confidence: number; // 0.0 to 1.0
}

export interface EnhancedProductInfo extends ProductInfo {
    classifiedImages: ImageClassification[];
    preferredImageUrl: string | null;
    hasProductOnlyImages: boolean;
}

export interface OutfitParseResult {
    success: boolean;
    error?: string;
    product: EnhancedProductInfo;
    timing?: {
        scrapeMs: number;
        geminiMs: number;
        classificationMs: number;
        totalMs: number;
    };
    tokensUsed?: {
        input: number;
        output: number;
        classificationTokens?: {
            input: number;
            output: number;
        };
    };
}

function parseJsonSafely(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}

/**
 * Aggressively clean HTML for Gemini - extract only product-relevant parts
 * Goal: Reduce from 35K tokens to ~5K tokens
 */
function cleanHtmlForAI(html: string): string {
    // Step 1: Remove all scripts, styles, comments, noscript
    let cleaned = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

    // Step 2: Remove excessive whitespace
    cleaned = cleaned
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><');

    // Step 3: Extract key sections - meta tags, JSON-LD, and main product area
    const sections: string[] = [];

    // Keep all meta tags (og:image, product info)
    const metaMatches = cleaned.match(/<meta[^>]*>/gi) || [];
    sections.push(metaMatches.slice(0, 30).join('\n'));

    // Keep JSON-LD structured data (very valuable!)
    const jsonLdMatches = cleaned.match(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
    sections.push(jsonLdMatches.join('\n'));

    // Keep img tags with src/data-src (for finding product images)
    const imgMatches = cleaned.match(/<img[^>]*>/gi) || [];
    const relevantImgs = imgMatches
        .filter(img => !img.includes('logo') && !img.includes('icon') && !img.includes('sprite'))
        .slice(0, 50);
    sections.push(relevantImgs.join('\n'));

    // Keep picture/source tags
    const pictureMatches = cleaned.match(/<picture[^>]*>[\s\S]*?<\/picture>/gi) || [];
    sections.push(pictureMatches.slice(0, 20).join('\n'));

    // Keep elements with product-related classes/ids (limited)
    const productPatterns = [
        /<[^>]*(product|item|pdp|gallery|media|image-container)[^>]*>[^<]*<\/[^>]*>/gi,
    ];
    for (const pattern of productPatterns) {
        const matches = cleaned.match(pattern) || [];
        sections.push(matches.slice(0, 20).join('\n'));
    }

    // Combine and limit total size
    let result = sections.join('\n\n');

    // Final truncation - aim for ~15KB which is roughly 5K tokens
    if (result.length > 15000) {
        result = result.substring(0, 15000);
    }

    // If we got almost nothing, fall back to truncated original
    if (result.length < 500) {
        result = cleaned.substring(0, 15000);
    }

    return result;
}

/**
 * Extract potential product image URLs from raw HTML using regex
 * This runs BEFORE truncation to ensure we don't lose image URLs
 */
function extractCandidateImageUrls(html: string): string[] {
    const candidates = new Set<string>();

    // 1. Find all img src and data-src
    const imgRegex = /<img[^>]+(?:src|data-src|data-lazy|data-original)=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        if (isValidImageUrl(match[1])) candidates.add(match[1]);
    }

    // 2. Find srcset URLs (often high res)
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    while ((match = srcsetRegex.exec(html)) !== null) {
        const urls = match[1].split(',').map(s => s.trim().split(' ')[0]);
        urls.forEach(url => {
            if (isValidImageUrl(url)) candidates.add(url);
        });
    }

    // 3. Find JSON-LD image arrays
    const jsonLdRegex = /"image":\s*\[([^\]]+)\]/g;
    while ((match = jsonLdRegex.exec(html)) !== null) {
        const urls = match[1].match(/"([^"]+)"/g);
        if (urls) {
            urls.forEach(u => {
                const clean = u.replace(/"/g, '');
                if (isValidImageUrl(clean)) candidates.add(clean);
            });
        }
    }

    // 4. Find og:image
    const ogImageRegex = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
    while ((match = ogImageRegex.exec(html)) !== null) {
        if (isValidImageUrl(match[1])) candidates.add(match[1]);
    }

    return Array.from(candidates).slice(0, 100); // Limit to 100 candidates to save tokens
}

function isValidImageUrl(url: string): boolean {
    if (!url || url.length < 10) return false;
    if (url.startsWith('data:')) return false; // Skip base64
    const lower = url.toLowerCase();
    // Skip obvious junk
    if (lower.includes('icon') || lower.includes('logo') || lower.includes('tracker') || lower.includes('pixel') || lower.includes('sprite')) return false;
    // Must look like an image
    return /\.(jpg|jpeg|png|webp|avif)/i.test(lower) || lower.includes('image') || lower.includes('/assets/');
}

/**
 * Sanitize and validate image URLs to ensure they pass Zod's strict URL validation
 * Fixes: protocol-relative URLs (//cdn.example.com), whitespace, and malformed URLs
 */
function sanitizeImageUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;

    // Trim whitespace
    let sanitized = url.trim();

    // Skip data URLs
    if (sanitized.startsWith('data:')) return null;

    // Fix protocol-relative URLs (//cdn.example.com/...)
    if (sanitized.startsWith('//')) {
        sanitized = 'https:' + sanitized;
    }

    // Ensure URL starts with http:// or https://
    if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
        // If it looks like a path, skip it
        if (sanitized.startsWith('/') || !sanitized.includes('.')) {
            return null;
        }
        // Otherwise, try adding https://
        sanitized = 'https://' + sanitized;
    }

    // Validate URL format using URL constructor
    try {
        new URL(sanitized);
        return sanitized;
    } catch {
        return null;
    }
}


/**
 * Parse product link using scrape.do + Gemini AI (direct HTML analysis)
 */
export async function parseProductLink(url: string): Promise<ParseResult> {
    const totalStart = Date.now();
    let scrapeMs = 0, geminiMs = 0;
    let tokensUsed = { input: 0, output: 0 };

    try {
        logger.info({ url }, 'Starting link parse');

        // Step 1: Fetch HTML via scrape.do
        const scrapeStart = Date.now();
        const encodedUrl = encodeURIComponent(url);
        const scrapeUrl = `http://api.scrape.do/?url=${encodedUrl}&token=${SCRAPE_API_TOKEN}&super=true`;

        logger.debug('Fetching via scrape.do (Super Proxy)');
        const response = await axios.get(scrapeUrl, {
            timeout: 30000,
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        const html = response.data;
        scrapeMs = Date.now() - scrapeStart;
        logger.info({ duration: scrapeMs }, 'Scrape.do fetch complete');

        if (!html || typeof html !== 'string') {
            throw new Error('Invalid HTML response from scrape.do');
        }

        // Step 2: Clean HTML and send directly to Gemini
        const geminiStart = Date.now();

        // NEW: Extract candidate images from RAW HTML before cleaning/truncation
        const candidateImages = extractCandidateImageUrls(html);
        const cleanedHtml = cleanHtmlForAI(html);

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `You are analyzing an e-commerce product page HTML to extract product information.

PAGE URL: ${url}

CANDIDATE IMAGE URLS (Found in raw HTML):
${JSON.stringify(candidateImages, null, 2)}

HTML CONTENT (Truncated):
${cleanedHtml}

YOUR TASK:
Extract the following from this product page:
1. Product name/title
2. Price (with currency symbol)
3. The MAIN PRODUCT IMAGE URLs (hero images showing the actual product being sold)
4. Store/brand name

CRITICAL RULES FOR IMAGES:
- Analyze both the HTML context AND the "CANDIDATE IMAGE URLS" list provided above.
- The HTML might be truncated, so rely on the Candidate List for high-res URLs.
- ONLY select the PRIMARY PRODUCT IMAGES (front view, main hero shots).
- IGNORE: thumbnails (<100px), suggested/similar products, ads, logos, icons, banners, review images.
- Return 1-6 best product image URLs (prioritize high resolution).

Return ONLY valid JSON (no markdown, no code fences):
{
  "name": "Product Name",
  "price": "₹2,999" or "$49.90" or "",
  "source": "Store Name",
  "imageUrls": ["url1", "url2"]
}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Get token usage
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
            tokensUsed.input = usageMetadata.promptTokenCount || 0;
            tokensUsed.output = usageMetadata.candidatesTokenCount || 0;
            logger.debug({ input: tokensUsed.input, output: tokensUsed.output, total: tokensUsed.input + tokensUsed.output }, 'Token usage');
        }

        geminiMs = Date.now() - geminiStart;
        logger.info({ duration: geminiMs }, 'Gemini extraction complete');

        const parsed = parseJsonSafely(responseText);

        if (!parsed) {
            throw new Error('Failed to parse Gemini response as JSON');
        }

        const totalMs = Date.now() - totalStart;
        logger.info({ duration: totalMs, url }, 'Link parse complete');

        const hostname = new URL(url).hostname.replace('www.', '');

        // Sanitize all image URLs to ensure they pass Zod validation
        const rawImageUrls = parsed.imageUrls || [];
        const sanitizedImageUrls = rawImageUrls
            .map((imgUrl: string) => sanitizeImageUrl(imgUrl))
            .filter((imgUrl: string | null): imgUrl is string => imgUrl !== null);

        return {
            success: true,
            product: {
                name: parsed.name || hostname,
                imageUrls: sanitizedImageUrls,
                price: parsed.price || '',
                source: parsed.source || hostname,
                originalUrl: url
            },
            timing: {
                scrapeMs,
                geminiMs,
                totalMs
            },
            tokensUsed
        };

    } catch (error: any) {
        const totalMs = Date.now() - totalStart;
        logger.error({ duration: totalMs, error: error?.message || error }, 'Link parse failed');

        return {
            success: false,
            error: error?.message || 'Could not parse product link',
            product: {
                name: 'Product',
                imageUrls: [],
                price: '',
                source: 'Unknown',
                originalUrl: url
            },
            timing: {
                scrapeMs,
                geminiMs,
                totalMs
            },
            tokensUsed
        };
    }
}

// ==================== OUTFIT MODE FUNCTIONS ====================

/**
 * Classify product images for Outfit Mode using Gemini Vision
 * Determines whether each image shows only the product or a model wearing full outfit
 */
export async function classifyProductImagesForOutfit(imageUrls: string[]): Promise<{
    classifications: ImageClassification[];
    tokensUsed: { input: number; output: number };
}> {
    if (imageUrls.length === 0) {
        return { classifications: [], tokensUsed: { input: 0, output: 0 } };
    }

    const tokensUsed = { input: 0, output: 0 };

    try {
        logger.info({ imageCount: imageUrls.length }, 'Starting image classification for Outfit Mode');

        // Download images and convert to base64
        const imageContents: { inlineData: { mimeType: string; data: string } }[] = [];

        for (const url of imageUrls.slice(0, 10)) { // Limit to 10 images max
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const contentType = response.headers['content-type'] || 'image/jpeg';
                const base64 = Buffer.from(response.data).toString('base64');

                imageContents.push({
                    inlineData: {
                        mimeType: contentType,
                        data: base64
                    }
                });
            } catch (err: any) {
                logger.warn({ url, error: err.message }, 'Failed to download image for classification');
            }
        }

        if (imageContents.length === 0) {
            logger.warn('No images could be downloaded for classification');
            return {
                classifications: imageUrls.map(url => ({
                    url,
                    type: 'unclear' as const,
                    confidence: 0
                })),
                tokensUsed
            };
        }

        // Create Gemini Vision request with all images
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `You are analyzing product images for a virtual try-on fashion app.
We need to identify which images show ONLY the clothing item vs which show a model wearing a FULL OUTFIT.

ANALYZE EACH IMAGE and classify as:
- "product_only": Shows ONLY the target clothing item. Examples:
  * Flat-lay photos (clothing laid on surface)
  * Ghost mannequin / invisible model shots
  * Single item on plain/white background
  * Close-up of just the product
  
- "model_full_outfit": Shows a model/person wearing the item WITH OTHER VISIBLE CLOTHING. Examples:
  * Model wearing jeans + a different shirt/top
  * Full body shot with multiple clothing items visible
  * Styled outfit look with accessories

- "unclear": Cannot determine (low quality, cropped, ambiguous)

CRITICAL: We want "product_only" images because for outfit layering, we need JUST the item, not the full outfit a model is wearing.

For each image (numbered by position), provide:
1. type: "product_only" | "model_full_outfit" | "unclear"
2. confidence: 0.0 to 1.0 (how confident you are)
3. reason: Brief explanation

Return ONLY valid JSON (no markdown, no code fences):
{
  "classifications": [
    {"index": 0, "type": "product_only", "confidence": 0.9, "reason": "Flat-lay shot of jeans on white background"},
    {"index": 1, "type": "model_full_outfit", "confidence": 0.85, "reason": "Model wearing jeans with a visible t-shirt"}
  ]
}`;

        // Build the request with images
        const requestParts: any[] = [prompt, ...imageContents];

        const result = await model.generateContent(requestParts);
        const responseText = result.response.text();

        // Get token usage
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
            tokensUsed.input = usageMetadata.promptTokenCount || 0;
            tokensUsed.output = usageMetadata.candidatesTokenCount || 0;
            logger.debug({ input: tokensUsed.input, output: tokensUsed.output }, 'Classification token usage');
        }

        const parsed = parseJsonSafely(responseText);

        if (!parsed || !Array.isArray(parsed.classifications)) {
            logger.warn('Failed to parse classification response');
            return {
                classifications: imageUrls.map(url => ({
                    url,
                    type: 'unclear' as const,
                    confidence: 0
                })),
                tokensUsed
            };
        }

        // Map classifications back to URLs
        const classifications: ImageClassification[] = imageUrls.map((url, index) => {
            const match = parsed.classifications.find((c: any) => c.index === index);
            if (match) {
                return {
                    url,
                    type: match.type as 'product_only' | 'model_full_outfit' | 'unclear',
                    confidence: match.confidence || 0.5
                };
            }
            return {
                url,
                type: 'unclear' as const,
                confidence: 0
            };
        });

        logger.info({
            total: classifications.length,
            productOnly: classifications.filter(c => c.type === 'product_only').length,
            modelOutfit: classifications.filter(c => c.type === 'model_full_outfit').length,
            unclear: classifications.filter(c => c.type === 'unclear').length
        }, 'Image classification complete');

        return { classifications, tokensUsed };

    } catch (error: any) {
        logger.error({ error: error.message }, 'Image classification failed');
        return {
            classifications: imageUrls.map(url => ({
                url,
                type: 'unclear' as const,
                confidence: 0
            })),
            tokensUsed
        };
    }
}

/**
 * Parse product link for Outfit Mode - includes image classification step
 * Uses existing parseProductLink, then classifies images to find product-only shots
 */
export async function parseProductLinkForOutfit(url: string): Promise<OutfitParseResult> {
    const totalStart = Date.now();
    let classificationMs = 0;

    try {
        // Step 1: Use existing parse function
        const baseResult = await parseProductLink(url);

        if (!baseResult.success || baseResult.product.imageUrls.length === 0) {
            return {
                success: baseResult.success,
                error: baseResult.error,
                product: {
                    ...baseResult.product,
                    classifiedImages: [],
                    preferredImageUrl: baseResult.product.imageUrls[0] || null,
                    hasProductOnlyImages: false
                },
                timing: {
                    scrapeMs: baseResult.timing?.scrapeMs || 0,
                    geminiMs: baseResult.timing?.geminiMs || 0,
                    classificationMs: 0,
                    totalMs: Date.now() - totalStart
                },
                tokensUsed: baseResult.tokensUsed
            };
        }

        // Step 2: Classify images using Gemini Vision
        const classificationStart = Date.now();
        const { classifications, tokensUsed: classificationTokens } = await classifyProductImagesForOutfit(
            baseResult.product.imageUrls
        );
        classificationMs = Date.now() - classificationStart;

        // Step 3: Find best product-only image
        const productOnlyImages = classifications
            .filter(c => c.type === 'product_only')
            .sort((a, b) => b.confidence - a.confidence);

        const hasProductOnlyImages = productOnlyImages.length > 0;

        // Prefer product-only, fallback to first image
        const preferredImageUrl = hasProductOnlyImages
            ? productOnlyImages[0].url
            : baseResult.product.imageUrls[0];

        logger.info({
            url,
            hasProductOnlyImages,
            preferredImage: preferredImageUrl?.substring(0, 50) + '...',
            classificationMs
        }, 'Outfit mode parse complete');

        return {
            success: true,
            product: {
                ...baseResult.product,
                classifiedImages: classifications,
                preferredImageUrl,
                hasProductOnlyImages
            },
            timing: {
                scrapeMs: baseResult.timing?.scrapeMs || 0,
                geminiMs: baseResult.timing?.geminiMs || 0,
                classificationMs,
                totalMs: Date.now() - totalStart
            },
            tokensUsed: {
                input: baseResult.tokensUsed?.input || 0,
                output: baseResult.tokensUsed?.output || 0,
                classificationTokens
            }
        };

    } catch (error: any) {
        logger.error({ error: error.message, url }, 'Outfit mode parse failed');
        return {
            success: false,
            error: error.message || 'Failed to parse link for outfit mode',
            product: {
                name: 'Product',
                imageUrls: [],
                price: '',
                source: 'Unknown',
                originalUrl: url,
                classifiedImages: [],
                preferredImageUrl: null,
                hasProductOnlyImages: false
            },
            timing: {
                scrapeMs: 0,
                geminiMs: 0,
                classificationMs,
                totalMs: Date.now() - totalStart
            }
        };
    }
}
