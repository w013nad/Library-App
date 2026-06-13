# Library Scanner 📚🎬

**Library Scanner** is a mobile-first, high-premium hybrid application designed to scan book covers and movie/show posters. It instantly retrieves verified, real-time metadata, Goodreads ratings (for books), or IMDb ratings (for movies) using the new Google Gen AI SDK powered by Gemini and Google Search grounding.

---

## ⚡ Quick Start: Mobile Installation

To build and run the mobile app on your physical device, follow these quick steps:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build the Web Assets**:
   ```bash
   npm run build
   ```

3. **Generate native Android assets and sync**:
   ```bash
   npx cap sync
   ```

4. **Create the APK in Android Studio**:
   - Open **Android Studio**.
   - Select **Open an Existing Project** and choose the `android/` directory of this project.
   - Wait for Gradle sync to complete.
   - In the top menu, go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
   - When finished, click **Locate** in the bottom-right notification to find the compiled `app-debug.apk`.

5. **Install on your Phone**:
   - Copy the `app-debug.apk` file over to your Android phone (via USB, Google Drive, email, or local sharing).
   - Locate the APK file in your phone's File Manager and tap it to install (enable "Install from unknown sources" if prompted).

---

## ⚙️ Theory & Architecture

```mermaid
graph TD
    A[Mobile / Web Client] --> B{Connection Mode}
    B -->|Direct Mode| C[Gemini / Vertex API Endpoint]
    B -->|Server Mode| D[Express Backend Server]
    D --> E[Google Gen AI SDK]
    E --> C
    C --> F{GCP Provider}
    F -->|Google AI Studio| G[Gemini 2.5 / 3.5 Models]
    F -->|Vertex AI| H[Vertex AI Model Endpoints]
    G --> I[Google Search Grounding]
    H --> I
    I --> J[Live Web Query: Goodreads / IMDb]
    J --> K[JSON Schema Response]
    K --> A
```

### 1. Dual Connection Modes
To ensure developer flexibility, the client app can route requests in two ways:
- **Direct Mode (Serverless)**: Bypasses the Node.js backend server entirely. The browser client connects directly to Google's API endpoints. API keys can either be injected during compilation via your `.env` file or configured dynamically inside the client-side settings menu (and saved securely to browser `localStorage`).
- **Server Mode**: The client makes a POST request to the local Express backend `/api/scan`. The backend server initializes the `@google/genai` SDK using server-side environment variables. This mode is ideal for local development, securing credentials, or hosting the application in containerized environments (such as Google Cloud Run).

### 2. Search Grounding & Real-Time Ratings
Standard LLMs suffer from training cutoffs and lack precise catalog rating information. Library Scanner overcomes this by enabling **Google Search Grounding** within the model configuration. 
When a cover is uploaded:
1. Gemini identifies the work from the visual content.
2. A search grounding query is executed to lookup the current live community score (e.g., Goodreads for books or IMDb for movies/shows).
3. The results are parsed and validated against the web grounding sources before being structured into a typed JSON schema.

### 3. Smart Fallback Engine (Direct & Server)
To optimize costs, handle billing caps, and maintain service availability:
- **Model Compatibility Fallback**: If a selected model (such as Gemini 3.5) does not support Search Grounding on your credentials (throwing a `400 Bad Request`), the engine catches the exception and immediately retries the request using `gemini-2.5-flash`.
- **Billing / Quota Fallback**: If the primary API key encounters a quota limit (`429`), billing issue (`402`), or validation error, the engine automatically attempts to complete the request using a **Backup API Key** (if provided). In this fallback mode, Search Grounding is disabled to ensure the request is free/low-cost.
- **Lite Fallback**: If no backup key is configured, the system falls back to running on `gemini-2.5-flash-lite` to try to process the request under standard free tiers.

### 4. Thinking Configuration Management
For next-generation Gemini models (3.x+), the SDK configures `thinkingLevel: MINIMAL` to lower generation latency and speed up scan responses. For legacy Gemini models (2.5-flash/lite), thinking budget is turned off (`thinkingBudget: 0`) since thinking is not supported.

---

## 🎨 Premium Aesthetic & Philosophy
Library Scanner employs a high-premium, organic, and minimalist design language:
- **Color Palette**: Alabaster white/beige (`#FAF9F6`), Sage green (`#7D8B7D`), and deep charcoal/olive accents (`#5A5A40`, `#2D2D2D`).
- **Typography**: Editorial serif headers matched with clean sans-serif numerical tags and badges.
- **Micro-interactions**: Smooth card reveals, springy modals, and active scanning wave animations using Motion (Framer Motion).

---

## 📁 Project Structure

```
├── .env.example              # Example environment configuration
├── .gitignore                # Git ignore configuration (.idea, node_modules, android, ios)
├── agents.md                 # Context & instructions for AI coding assistants
├── assets/
│   └── icon.png              # 1024x1024 master application icon source
├── server.ts                 # Express backend API & Vite Dev server entrypoint
├── capacitor.config.ts       # Capacitor native integration config
├── vite.config.ts            # Vite compiler, HMR, and build settings
├── package.json              # Scripts and package dependencies
└── src/
    ├── App.tsx               # Main React entrypoint
    ├── index.css             # Tailwind stylesheet & design tokens
    └── components/
        └── Scanner.tsx       # Core scanning layout, camera feed, and settings UI
```

---

## ⚙️ Development & Server Mode Setup

### Configure Environment Variables
Create a `.env` file in the root directory and define the credentials:
```env
# Google AI Studio API Key (Primary)
GEMINI_API_KEY="AIzaSyYourAPIKeyHere..."

# Optional Backup API Key (used for free fallback without grounding when primary fails)
GEMINI_API_KEY_BACKUP="AIzaSyYourBackupAPIKeyHere..."

# Optional Vertex AI / Google Cloud Settings
# VERTEX_AI_PROJECT="your-gcp-project-id"
# VERTEX_AI_LOCATION="us-central1"
# VERTEX_AI_API_KEY="your-restricted-gcp-api-key"
```

### Run the App Locally
Start the unified Vite + Express development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

---

## 📱 Mobile Syncing & Asset Generation

> [!NOTE]
> Since mobile devices cannot easily reach `localhost` loopback addresses, if you run in **Server Mode**, you should set the **Express Server URL** in the application settings (gear icon) to your machine's local network IP address (e.g. `http://192.168.1.150:3000`). Alternatively, switch to **Direct Mode** to request API queries straight from your phone to Google endpoints.

### Generating App Icons & Splash Screens
Capacitor Assets will automatically crop and scale the master icon file (`assets/icon.png`) to fit all required device density slots:
```bash
npx capacitor-assets generate --android
npx capacitor-assets generate --ios
```

---

## 🛡️ License
This project is private and proprietary.
