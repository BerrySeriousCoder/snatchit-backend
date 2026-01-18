# Snatched Backend API Documentation

## Base URL
```
http://localhost:3000
```

## Environment Setup

Copy `.env.example` to `.env` and fill in your credentials:
- **DATABASE_URL**: Your Neon PostgreSQL connection string
- **GEMINI_API_KEY**: Google AI API key from ai.google.dev
- **B2_APPLICATION_KEY_ID**, **B2_APPLICATION_KEY**, **B2_BUCKET_ID**, **B2_BUCKET_NAME**: Backblaze B2 credentials

## API Endpoints

### 1. Health Check
```http
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "message": "Snatched Backend is running!",
  "timestamp": "2025-12-03T10:20:00.000Z"
}
```

---

### 2. Create User
```http
POST /api/users/create
Content-Type: multipart/form-data
```
**Body:**
- `bodyPhoto` (file): User's full-body mirror selfie
- `phone` (optional): User's phone number

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "bodyPhotoUrl": "https://...",
    "createdAt": "2025-12-03T10:20:00.000Z"
  }
}
```

---

### 3. Get User
```http
GET /api/users/:userId
```
**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "body_photo_url": "https://...",
    "phone": "+1234567890",
    "created_at": "2025-12-03T10:20:00.000Z"
  }
}
```

---

### 4. Parse Product Link
```http
POST /api/parse-link
Content-Type: application/json
```
**Body:**
```json
{
  "url": "https://www.zara.com/product/12345"
}
```
**Response:**
```json
{
  "success": true,
  "product": {
    "name": "Cotton T-Shirt",
    "imageUrl": "https://...",
    "price": "₹2,999",
    "source": "Zara",
    "originalUrl": "https://..."
  }
}
```
**Supported Sites:** Zara, Amazon, Myntra, AJIO, Flipkart

---

### 5. Generate Virtual Try-On
```http
POST /api/generate
Content-Type: application/json
```
**Body:**
```json
{
  "userId": "uuid",
  "productImageUrl": "https://...",
  "productName": "Cotton T-Shirt",
  "productUrl": "https://..."
}
```
**Response:**
```json
{
  "success": true,
  "generatedImageUrl": "https://...",
  "message": "Virtual try-on generated successfully!"
}
```
**Note:** This uses Gemini 3 Pro Image to generate the try-on image.

---

### 6. Save Look
```http
POST /api/looks/save
Content-Type: application/json
```
**Body:**
```json
{
  "userId": "uuid",
  "productUrl": "https://...",
  "productName": "Cotton T-Shirt",
  "productImageUrl": "https://...",
  "generatedImageUrl": "https://..."
}
```
**Response:**
```json
{
  "success": true,
  "look": {
    "id": "uuid",
    "user_id": "uuid",
    "product_name": "Cotton T-Shirt",
    "generated_image_url": "https://...",
    "created_at": "2025-12-03T10:20:00.000Z"
  }
}
```

---

### 7. Get User's Looks
```http
GET /api/looks/:userId
```
**Response:**
```json
{
  "success": true,
  "looks": [
    {
      "id": "uuid",
      "product_name": "Cotton T-Shirt",
      "product_image_url": "https://...",
      "generated_image_url": "https://...",
      "created_at": "2025-12-03T10:20:00.000Z"
    }
  ]
}
```

---

### 8. Delete Look
```http
DELETE /api/looks/:lookId
```
**Response:**
```json
{
  "success": true,
  "message": "Look deleted successfully"
}
```

## Error Responses
All errors return appropriate HTTP status codes with:
```json
{
  "error": "Error message",
  "details": "Additional details (if available)"
}
```

## Running the Server
```bash
cd backend
npm install
npm start
```
