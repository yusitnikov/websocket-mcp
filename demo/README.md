# Demo Web Application

A modern web application built with **TypeScript**, **Vite**, demonstrating npm package integration and service worker functionality.

## Features

- 🚀 **Vite Development Server** with hot reload
- 📦 **NPM Package Integration** (Lodash, Axios, MCP SDK, Zod) with full TypeScript support
- ⚡ **Service Worker** for caching and offline functionality
- 🎨 **Modern CSS** with responsive design
- 📘 **Full TypeScript** support with strict typing

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

## What's Included

### Frontend (Vite + TypeScript)
- **Lodash Demo:** Shows array manipulation functions with full typing
- **Axios Demo:** Fetches data from JSONPlaceholder API with typed responses
- **Service Worker:** Caches resources for offline use with TypeScript events
- **Responsive Design:** Works on desktop and mobile
- **MCP SDK & Zod:** Ready for advanced integrations

### NPM Package Usage with TypeScript
The project demonstrates how to use npm packages with full TypeScript support:

```typescript
import _ from 'lodash';                    // Utility functions
import axios, { AxiosResponse } from 'axios'; // HTTP client

// Use them with full type safety
const chunked: number[][] = _.chunk([1,2,3,4,5,6], 2);
const response: AxiosResponse<User[]> = await axios.get('/api/users');
```

## Available Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Project Structure

```
demo/
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite configuration
├── index.html           # Entry point
├── src/
│   ├── main.ts          # Main TypeScript
│   ├── style.css        # Styling
│   └── service-worker.ts # Service worker (TypeScript)
└── public/              # Static assets
```

## Service Worker Features

The service worker provides:
- **Caching:** Static assets cached for offline use
- **Background Sync:** For future data synchronization
- **Push Notifications:** Ready for notification features

## TypeScript Benefits

- **Type Safety:** Catch errors at compile time
- **IntelliSense:** Better IDE support and autocompletion
- **Refactoring:** Safe and reliable code changes
- **API Contracts:** Clear interfaces for data structures

## Development Tips

1. **Adding new npm packages:** `npm install package-name @types/package-name`
2. **Using in code:** `import packageName from 'package-name'` with full type support
3. **Hot reload:** Changes are reflected instantly during development
4. **Type checking:** TypeScript validates your code in real-time
5. **Production build:** Creates optimized bundle in `dist/`

Enjoy building with modern TypeScript web technologies! 🎉