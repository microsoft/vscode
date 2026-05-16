# Build Guide

This document provides instructions for building AI Studio locally.

## Development Environment

- Node.js 22+
- npm

## Setup

1. Install root dependencies:
   ```bash
   npm install
   ```
2. Install app dependencies:
   ```bash
   cd app
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Development

Run the following command in the `app` directory to start the frontend and Electron in development mode:
```bash
npm run dev
```

## Production Build

To build the application for your current platform:

1. Build frontend:
   ```bash
   npm run build:frontend
   ```
2. Build Electron:
   ```bash
   npm run build:electron
   ```
3. Package the app:
   ```bash
   npm run package
   ```

Or use the shortcut:
```bash
npm run package:[win|linux]
```

*Note: macOS support is temporarily disabled in the production release pipeline.*

## Build Artifacts

The built application and installers will be located in `app/dist/`.
