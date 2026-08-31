# GoGrocery Backend API

Backend RESTful API service built with Node.js, Express, MongoDB (Mongoose), and JWT authentication.

## Folder Structure

```text
gogrocery-backend/
│
├── config/          # Environment & Database Configuration
├── routes/          # Express Route Handlers
├── controllers/     # Controller Logic
├── services/        # Business Logic & Data Services
├── middlewares/     # Custom Express Middlewares (Auth, Error Handling, etc.)
├── schemas/         # Mongoose Data Schemas / Models
├── encryptions/     # Password Hashing & JWT Helper functions
├── validations/     # Input Request Validation Schemas (Zod)
├── utils/           # Helper Utilities
├── constants/       # App Constants & HTTP Status Codes
│
├── app.js           # Express App Setup
├── server.js        # Server Entry Point
│
├── .env             # Environment Variables (Git Ignored)
├── .gitignore       # Git Ignored files
├── package.json     # Project Metadata & Dependencies
└── README.md        # Documentation
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy or adjust `.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/gogrocery
JWT_SECRET=supersecretkey_gogrocery_2026
JWT_EXPIRE=30d
```

### 3. Start Development Server
```bash
npm run server
```

### 4. Health Check
Access `http://localhost:5000/api/health` in your browser or API client.
