import axios from 'axios';
import { logger } from './logger';

/**
 * Download product images in parallel and return them as base64 strings
 */
export async function downloadProductImages(urls: string[]): Promise<string[]> {
    const start = Date.now();

    const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/',
    };

    const promises = urls.map(url =>
        axios.get(url, {
            responseType: 'arraybuffer',
            headers: browserHeaders,
            timeout: 10000
        })
    );

    const results = await Promise.allSettled(promises);
    const base64s = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => Buffer.from(result.value.data).toString('base64'));

    if (base64s.length === 0) {
        throw new Error('Failed to download any product images');
    }

    logger.info({ successful: base64s.length, total: urls.length, duration: Date.now() - start }, 'Product images downloaded');
    return base64s;
}
