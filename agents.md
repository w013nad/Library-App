# AGENTS.md

This file provides system context, architecture boundaries, common commands, and UI styling guidelines for AI coding assistants working on the **Library Scanner** codebase.

---

## 1. Project Overview

**Library Scanner** (formerly *Verve Lens*) is a mobile-first book and movie cover scanning application built with React/Vite, packaged as a hybrid mobile app using Capacitor, and powered by Gemini 2.5 Flash with Google Search grounding.

- **Mobile Framework**: Capacitor 8.x
- **Frontend Stack**: React 19, TypeScript, Tailwind CSS 4, Vite 6, Lucide React icons, Motion (Framer Motion).
- **Backend Stack**: Express server running on Node.js.
- **AI Integration**: Google Gen AI SDK (`@google/genai`) for processing images and performing real-time search grounding.

---

## 2. Directory Structure

- `/src/` — React frontend source code.
  - `/src/components/Scanner.tsx` — Core scanning interface, camera viewfinder, connection settings, and layout.
  - `/src/App.tsx` — Root component.
  - `/src/index.css` — Global CSS stylesheet.
- `/assets/` — Shared asset resources.
  - `assets/icon.png` — 1024x1024 source app icon.
- `/android/` — Native Android project files.
- `/ios/` — Native iOS project files.
- `/server.ts` — Express development and API server file.
- `/capacitor.config.ts` — Capacitor mobile build configuration.
- `/vite.config.ts` — Vite compiler and HMR configuration.

---

## 3. Core Development Commands

AI agents should run commands using `cmd.exe /c` on Windows environments to avoid execution policy conflicts.

### Running the App Locally (Web Dev)
Runs both the React Vite frontend and the Express backend API server on port 3000:
```bash
npm run dev
```

### Compiling and Syncing Mobile Assets
Whenever you edit code in `/src/`, you must compile the bundle and sync it into the native platforms before building the mobile app:
```bash
npm run build
npx cap sync
```

### Generating App Icons & Splash Screens
Generates multi-density platform assets for Android using the source image in `assets/icon.png`:
```bash
npx capacitor-assets generate --android
```

### Building the Debug Android APK
Runs the Gradle build to generate the `.apk` package file:
```bash
cd android && .\gradlew.bat assembleDebug
```
The output APK is placed at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 4. Architecture & Technical Rules

### A. Direct Connection Mode (Serverless)
The client app in [Scanner.tsx](file:///c:/code/Library-App/src/components/Scanner.tsx) connects directly to Google's Gemini API using an API key (either saved in the browser/localStorage, or configured from env). It bypasses the backend Node server entirely.

### B. Environment Key Injection
- The Vite build configuration in [vite.config.ts](file:///c:/code/Library-App/vite.config.ts) injects the server's `.env` key into `import.meta.env.VITE_GEMINI_API_KEY`.
- If modifying Vite configuration, **do not change HMR / file watching rules** that are guarded by the `DISABLE_HMR` environment variable, as this prevents IDE flickering during development.

### C. Structured JSON Output Constraints
- **Gemini API Limitation**: Structured outputs (such as `responseMimeType: "application/json"` and `responseSchema`) **cannot** be used in combination with tool use (like Google Search Grounding/`googleSearch`). Doing so will trigger a `Tool use with a response mime type: 'application/json' is unsupported` API error.
- **Implementation**: To support real-time Goodreads and IMDb rating lookups via Google Search Grounding, we disable structured output configuration in the API payload and instead enforce JSON schema compliance purely via prompt instruction.
- **Client-Side Parsing**: Since the API does not force a JSON schema at the protocol level, [Scanner.tsx](file:///c:/code/Library-App/src/components/Scanner.tsx) uses a robust client-side parser (`parseInsight`) with regular expression fallbacks to extract, clean, and parse the JSON response.

---

## 5. UI & Design System

The application uses an organic, high-premium aesthetic:
- **Color Palette**: Alabaster white/beige (`#FAF9F6`), Sage green (`#7D8B7D`), and deep charcoal/olive for primary buttons/accents (`#5A5A40` and `#2D2D2D`).
- **Typography**: Serif fonts for titles (`font-serif`) and clean sans-serif for numbers/data (`font-sans`).
- **Shapes & Transitions**: Large rounded corners (`rounded-[32px]`, `rounded-[40px]`), soft drop shadows, and subtle micro-animations for cards and modals.
- **Placeholders**: Never use generic placeholder graphics. All icons should use Lucide React icons or generated visual assets.
