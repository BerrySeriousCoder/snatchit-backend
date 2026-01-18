# Security Notes

## Authentication
This API uses **Bearer token authentication** via JWT. All protected endpoints require a valid JWT in the `Authorization` header.

## CSRF Protection
CSRF (Cross-Site Request Forgery) protection is **not required** for this API because:

1. We use `Authorization` headers with Bearer tokens, not cookies
2. CSRF attacks rely on cookies being automatically sent with requests
3. Mobile apps store tokens in secure storage and explicitly attach them

Since tokens must be explicitly included in each request, CSRF attacks are not applicable.

## Input Validation
All endpoints validate inputs using Zod schemas:
- UUID format validation on all `:userId` params
- ISO 8601 date validation on cursor pagination
- MIME type whitelisting for image uploads (jpeg, png, webp, gif)
- Sharp validation of actual image content

## Rate Limiting
- Global: 1000 requests per 15 minutes
- AI/Scraping endpoints: 20 requests per 15 minutes
- Auth endpoints: 10 requests per 15 minutes
- Write operations: 60 requests per minute
