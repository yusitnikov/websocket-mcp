# Demo Web Application

A modern web application built with Vite, demonstrating npm package integration, service worker functionality, and Express.js backend.

## Features

- 🚀 **Vite Development Server** with hot reload
- 📦 **NPM Package Integration** (Lodash, Axios)
- ⚡ **Service Worker** for caching and offline functionality
- 🎨 **Modern CSS** with responsive design
- 🔧 **Express.js Backend** with API endpoints

## Quick Start

1. **Install dependencies:**
   ```bash
   cd demo
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 in your browser

3. **Optional - Start Express server (for API endpoints):**
   ```bash
   npm run server
   ```
   API available at http://localhost:4000

## What's Included

### Frontend (Vite)
- **Lodash Demo:** Shows array manipulation functions
- **Axios Demo:** Fetches data from JSONPlaceholder API
- **Service Worker:** Caches resources for offline use
- **Responsive Design:** Works on desktop and mobile

### Backend (Express)
- **API Endpoints:**
  - `GET /api/demo` - Simple demo endpoint
  - `GET /api/users` - Mock users data
  - `POST /api/data` - Echo received data
  - `GET /api/health` - Health check

### NPM Package Usage
The project demonstrates how to use npm packages in modern web development:

```javascript
import _ from 'lodash';        // Utility functions
import axios from 'axios';    // HTTP client

// Use them directly in your code
const chunked = _.chunk([1,2,3,4,5,6], 2);
const response = await axios.get('/api/users');
```

## Available Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run server` - Start Express API server

## Project Structure

```
demo/
├── package.json          # Dependencies and scripts
├── vite.config.js        # Vite configuration
├── index.html           # Entry point
├── server.js            # Express server
├── src/
│   ├── main.js          # Main JavaScript
│   ├── style.css        # Styling
│   └── service-worker.js # Service worker
└── public/              # Static assets
```

## Service Worker Features

The service worker provides:
- **Caching:** Static assets cached for offline use
- **Background Sync:** For future data synchronization
- **Push Notifications:** Ready for notification features

## Development Tips

1. **Adding new npm packages:** `npm install package-name`
2. **Using in code:** `import packageName from 'package-name'`
3. **Hot reload:** Changes are reflected instantly during development
4. **Production build:** Creates optimized bundle in `dist/`

Enjoy building with modern web technologies! 🎉