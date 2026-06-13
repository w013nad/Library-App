import { GoogleGenAI, type ThinkingConfig, ThinkingLevel } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Returns the appropriate thinking config to disable/minimize thinking based on model family
function getThinkingConfig(model: string): { thinkingConfig: ThinkingConfig } {
  if (model.startsWith("gemini-3")) {
    // Gemini 3.x supports MINIMAL as the lowest thinking level
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
  }
  // Gemini 2.5 and older: disable thinking entirely
  return { thinkingConfig: { thinkingBudget: 0 } };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Setup express to parse large JSON payloads (specifically Base64 images)
  app.use(express.json({ limit: "50mb" }));

  // API Route for image scanning
  app.post("/api/scan", async (req, res) => {
    try {
      const { imageBase64, mimeType, model } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Missing image payload." });
      }

      const useVertex = !!process.env.VERTEX_AI_PROJECT;

      if (!useVertex && !process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "API configuration missing. Provide GEMINI_API_KEY or VERTEX_AI_PROJECT." });
      }

      let ai: GoogleGenAI;
      if (useVertex) {
        const vertexApiKey = process.env.VERTEX_AI_API_KEY || process.env.GEMINI_API_KEY;
        const initOptions: any = {
          vertexai: true,
          project: process.env.VERTEX_AI_PROJECT,
          location: process.env.VERTEX_AI_LOCATION || "us-central1",
        };
        if (vertexApiKey) {
          initOptions.apiKey = vertexApiKey;
        }
        ai = new GoogleGenAI(initOptions);
      } else {
        ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });
      }

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

      const requestedModel = model || "gemini-2.5-flash";

      let response;
      try {
        response = await ai.models.generateContent({
          model: requestedModel,
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
            ...getThinkingConfig(requestedModel),
          },
        });
      } catch (primaryError: any) {
        console.warn("Primary API model failed or exhausted:", primaryError.message || primaryError);
        
        const backupKey = process.env.GEMINI_API_KEY_BACKUP;
        const primaryErrorMsg = (primaryError.message || "").toLowerCase();
        
        // Check if selected model doesn't support Google Search Grounding (400 Bad Request)
        const isUnsupportedToolError = 
          primaryError.status === 400 && 
          (primaryErrorMsg.includes("tool") || 
           primaryErrorMsg.includes("grounding") || 
           primaryErrorMsg.includes("support") || 
           primaryErrorMsg.includes("googlesearch"));

        if (isUnsupportedToolError && requestedModel !== "gemini-2.5-flash") {
          console.warn("Selected model does not support search grounding. Retrying with gemini-2.5-flash...");
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
                tools: [{ googleSearch: {} }],
                ...getThinkingConfig("gemini-2.5-flash"),
              },
            });
            return res.json({ result: response.text });
          } catch (retryErr: any) {
            console.error("Retry with gemini-2.5-flash failed:", retryErr);
          }
        }
        
        const isBillingOrQuotaError = 
          primaryError.status === 402 || 
          primaryError.status === 429 || 
          primaryError.status === 403 ||
          primaryErrorMsg.includes("billing") || 
          primaryErrorMsg.includes("quota") || 
          primaryErrorMsg.includes("limit") || 
          primaryErrorMsg.includes("prepay") ||
          primaryErrorMsg.includes("payment") ||
          primaryErrorMsg.includes("key not valid") ||
          primaryErrorMsg.includes("api key");

        if (isBillingOrQuotaError && backupKey) {
          console.warn("Retrying with backup API key and grounding disabled...");
          const backupAi = new GoogleGenAI({
            apiKey: backupKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build",
              },
            },
          });
          
          response = await backupAi.models.generateContent({
            model: requestedModel,
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
              // Disabling grounding since free/backup keys don't support it
              tools: [],
              ...getThinkingConfig(requestedModel),
            },
          });
        } else {
          console.warn("Retrying with primary key on gemini-2.5-flash-lite...");
          // Legacy fallback to gemini-2.5-flash-lite on primary key
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
              ...getThinkingConfig("gemini-2.5-flash-lite"),
            },
          });
        }
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
