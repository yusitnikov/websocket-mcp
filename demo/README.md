# Demo Web Application

A clean, minimal web application built with **TypeScript**, **Vite**, and **Service Worker** functionality.

## Features

- 🚀 **Vite Development Server** with hot reload
- 📘 **Full TypeScript** support with strict typing
- ⚡ **Service Worker** for basic caching and offline functionality
- 🎨 **Modern CSS** with responsive design
- 📦 **Ready for integration** with MCP SDK and Zod

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

### Core Setup

- **TypeScript** configuration with strict typing
- **Vite** for fast development and building
- **Service Worker** for basic offline functionality
- **Clean, minimal UI** ready for customization

### Available Packages

- **@modelcontextprotocol/sdk** - Ready for MCP integration
- **zod** - Schema validation library

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
│   └── shared-worker.ts # Service worker
└── public/              # Static assets
```

## Service Worker Features

- **Basic Caching** - Static assets cached for offline use
- **Cache Management** - Automatic cleanup of old caches
- **Same-origin only** - Only caches requests from your domain

## TypeScript Benefits

- **Type Safety** - Catch errors at compile time
- **IntelliSense** - Better IDE support and autocompletion
- **Refactoring** - Safe and reliable code changes

## Development Tips

1. **Service Worker** - Check DevTools → Application → Service Workers to verify registration
2. **TypeScript** - All code is strictly typed with no `any` usage
3. **Ready to extend** - Add your own features, APIs, and integrations

Perfect foundation for building modern web applications! 🎉
