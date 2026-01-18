import { GoogleAuth } from 'google-auth-library';

/**
 * Get a valid access token for Vertex AI API calls.
 * Uses Application Default Credentials (ADC) or GOOGLE_APPLICATION_CREDENTIALS.
 */
export async function getVertexAccessToken(): Promise<string> {
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
        throw new Error('Failed to generate Google Cloud access token');
    }

    return accessToken.token;
}
