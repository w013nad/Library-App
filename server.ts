import { GoogleGenAI } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Setup express to parse large JSON payloads (specifically Base64 images)
  app.use(express.json({ limit: "50mb" }));

  // API Route for image scanning
  app.post("/api/scan", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Missing image payload." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "API Key logic requires user setting." });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `Identify the book or movie cover in this photo.
Use your Google Search grounding tool to look up its exact current Goodreads (if a book) or IMDb (if a movie/show) rating.
You MUST respond with a valid, clean JSON object matching this schema. Verify the facts using Google Search:
{
  "title": "Exact Title of the Book or Movie",
  "creator": "Author(s) or Principal Director",
  "mediaType": "book" or "movie",
  "rating": "Exact rating found (e.g., '4.32/5' for Goodreads or '8.2/10' for IMDb)",
  "genre": "Primary Genre",
  "theme": "Prominent theme or core motif",
  "choice": "Release Year: [Year]",
  "synopsis": "Exactly one elegant sentence summarizing the item."
}
Return ONLY the raw JSON block. Do not add conversational text.`;

      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: imageBase64,
                    mimeType: mimeType || "image/jpeg",
                  },
                },
                { text: prompt },
              ],
            },
          ],
          config: {
            // Explicitly requested Grounding
            tools: [{ googleSearch: {} }],
          },
        });
      } catch (primaryError: any) {
        console.warn("Primary model gemini-2.5-flash failed or exhausted. Retrying with fallback: gemini-2.5-flash-lite...", primaryError);
        // Fallback to gemini-2.5-flash-lite
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: imageBase64,
                    mimeType: mimeType || "image/jpeg",
                  },
                },
                { text: prompt },
              ],
            },
          ],
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
      }

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "An unknown error occurred" });
    }
  });

  // Vite Integration for development / static serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
