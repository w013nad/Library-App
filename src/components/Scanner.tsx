import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Camera, Loader2, RefreshCw, Settings, X } from 'lucide-react';

export default function Scanner() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Connection Settings States
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem('verve_lens_api_key') || '';
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('verve_lens_selected_model') || 'gemini-2.5-flash';
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Temporary modal states
  const [tempKey, setTempKey] = useState<string>(customApiKey);
  const [tempModel, setTempModel] = useState<string>(selectedModel);

  useEffect(() => {
    if (settingsOpen) {
      setTempKey(customApiKey);
      setTempModel(selectedModel);
    }
  }, [settingsOpen, customApiKey, selectedModel]);

  const getApiKey = () => {
    if (customApiKey.trim()) return customApiKey.trim();
    const bundledKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    return bundledKey || '';
  };

  const handleSaveSettings = (
    key: string,
    model: string
  ) => {
    localStorage.setItem('verve_lens_api_key', key);
    localStorage.setItem('verve_lens_selected_model', model);
    setCustomApiKey(key);
    setSelectedModel(model);
    setSettingsOpen(false);
  };

  const callGeminiAPI = async (
    apiKey: string,
    model: string,
    base64Data: string,
    mimeType: string,
    useGrounding: boolean
  ): Promise<any> => {
    const prompt = `Identify the book or movie cover in this photo.
CRITICAL Search Grounding Rules:
1. You MUST use the Google Search grounding tool for EVERY SINGLE request. Do not rely on your pre-training knowledge.
2. For books ("mediaType": "book"): You MUST find the rating on Goodreads. The "rating" value in the JSON response MUST be formatted strictly as "X.XX/5 on Goodreads" (e.g., "4.12/5 on Goodreads").
3. For movies/shows ("mediaType": "movie"): You MUST find the rating on IMDb. The "rating" value in the JSON response MUST be formatted strictly as "X.X/10 on IMDb" (e.g., "6.8/10 on IMDb").
4. Under NO circumstances should you return ratings from other sites (such as Rotten Tomatoes, Moviefone, Metacritic, or Letterboxd) for the rating field. If a Goodreads or IMDb rating is absolutely not found in the search results, return "N/A" for the rating field.

You MUST respond ONLY with a raw JSON object matching the exact schema below.
CRITICAL Formatting Rules:
- Do NOT wrap the JSON block in markdown code fences (do NOT use \`\`\` or \`\`\`json).
- Do NOT include any conversational preamble, introduction, markdown headers, or postscript text.
- The very first character of your response MUST be '{' and the very last character MUST be '}'.

Expected JSON Schema:
{
  "title": "Exact Title of the Book or Movie",
  "creator": "Author(s) or Principal Director",
  "mediaType": "book" or "movie",
  "rating": "The IMDb or Goodreads rating matching the strict rules above, or 'N/A'",
  "genre": "Primary Genre",
  "theme": "Prominent theme or core motif",
  "choice": "Release Year: [Year]",
  "synopsis": "Exactly one elegant sentence summarizing the item."
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Configure thinking: disable for 2.5 models, minimize for 3.x models
    const thinkingConfig = model.startsWith('gemini-3')
      ? { thinkingLevel: 'MINIMAL' }
      : { thinkingBudget: 0 };

    const payload: any = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || 'image/jpeg'
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        thinkingConfig,
      },
    };

    if (useGrounding) {
      payload.tools = [
        {
          googleSearch: {}
        }
      ];
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || 'Failed to communicate directly with Gemini API.';
      const errStatus = response.status;
      const error = new Error(errMsg) as any;
      error.status = errStatus;
      throw error;
    }

    return data;
  };

  const performScan = async (base64Data: string, mimeType: string): Promise<string> => {
    const primaryKey = getApiKey();

    if (!primaryKey) {
      throw new Error("No Gemini API key is configured. Please open Settings and enter your key.");
    }

    let data;
    try {
      data = await callGeminiAPI(primaryKey, selectedModel, base64Data, mimeType, true);
    } catch (err: any) {
      console.warn("API key failed:", err);
      const errorMsg = err.message || '';

      // Check if it's a model compatibility issue with search grounding (400 Bad Request)
      const isUnsupportedToolError = 
        err.status === 400 && 
        (errorMsg.toLowerCase().includes('tool') || 
         errorMsg.toLowerCase().includes('grounding') || 
         errorMsg.toLowerCase().includes('support') || 
         errorMsg.toLowerCase().includes('googlesearch'));

      if (isUnsupportedToolError && selectedModel !== 'gemini-2.5-flash') {
        console.log("Selected model does not support Search Grounding. Retrying with gemini-2.5-flash...");
        data = await callGeminiAPI(primaryKey, 'gemini-2.5-flash', base64Data, mimeType, true);
      } else {
        throw err;
      }
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Received an empty response from Gemini. Please try again with a clearer picture.');
    }

    return text;
  };

  // Real-time streaming states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize live video stream on mount or reset
  const startLiveCamera = async () => {
    try {
      // Release any active stream first
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      
      setCameraStream(mediaStream);
      setHasCameraPermission(true);
      setCameraActive(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn("Direct live camera stream not supported or denied. Falling back to native system capture picker.", err);
      setHasCameraPermission(false);
      setCameraActive(false);
    }
  };

  useEffect(() => {
    startLiveCamera();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCaptureFromStream = async () => {
    if (!videoRef.current) return;
    
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not create canvas context.");
      
      // Draw the current video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Stop the camera stream preview after snapping
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      setCameraActive(false);

      const base64String = canvas.toDataURL('image/jpeg');
      setImagePreview(base64String);

      const base64Data = base64String.split(',')[1];

      const resultText = await performScan(base64Data, 'image/jpeg');
      setResult(resultText);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while grabbing the camera frame.');
      setImagePreview(null);
      // Restart camera stream so they can try again
      startLiveCamera();
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      // Create preview
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);

      // Convert to Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64String = await base64Promise;
      
      // Strip out the data URL prefix headers to get raw base64
      const base64Data = base64String.split(',')[1];
      const mimeType = file.type;

      // Send to server / direct API
      const resultText = await performScan(base64Data, mimeType);
      setResult(resultText);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while scanning.');
      setImagePreview(null);
    } finally {
      setLoading(false);
    }
  };

  const scanAnother = () => {
    setResult(null);
    setError(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Reinitialize direct live camera stream if supported
    startLiveCamera();
  };

  // Try to parse the strict JSON model response
  const parseInsight = (raw: string | null) => {
    if (!raw) return null;
    try {
      let cleaned = raw.trim();
      // Remove markdown format container if present
      if (cleaned.includes('```')) {
        const match = cleaned.match(/```(?:json)?([\s\S]*?)```/);
        if (match) {
          cleaned = match[1].trim();
        }
      }
      return JSON.parse(cleaned);
    } catch (e) {
      // Fallback regex parsing if JSON gets wrapped or contains extra text
      const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
      const creatorMatch = raw.match(/"creator"\s*:\s*"([^"]+)"/);
      const ratingMatch = raw.match(/"rating"\s*:\s*"([^"]+)"/);
      const genreMatch = raw.match(/"genre"\s*:\s*"([^"]+)"/);
      const themeMatch = raw.match(/"theme"\s*:\s*"([^"]+)"/);
      const choiceMatch = raw.match(/"choice"\s*:\s*"([^"]+)"/);
      const synopsisMatch = raw.match(/"synopsis"\s*:\s*"([^"]+)"/);

      if (titleMatch || ratingMatch || synopsisMatch) {
         return {
           title: titleMatch ? titleMatch[1] : "Detected Item",
           creator: creatorMatch ? creatorMatch[1] : "",
           rating: ratingMatch ? ratingMatch[1] : "Reviewed",
           genre: genreMatch ? genreMatch[1] : "General",
           theme: themeMatch ? themeMatch[1] : "",
           choice: choiceMatch ? choiceMatch[1] : "",
           synopsis: synopsisMatch ? synopsisMatch[1] : raw
         };
      }
      return null;
    }
  };

  const insight = parseInsight(result);

  // Fallback rating extraction for clean badges
  const extractRating = (text: string) => {
    const match = text.match(/([3-5]\.\d+|[7-9]\.\d+)\s*(\/10)?/);
    if (match) return match[1];
    return "Rated";
  };

  const displayedRating = insight?.rating 
    ? insight.rating 
    : (result ? extractRating(result) : "...");

  return (
    <div id="lens-store-app" className="w-full max-w-5xl mx-auto bg-[#FAF9F6] text-[#2D2D2D] font-sans flex flex-col md:rounded-[40px] md:shadow-xl md:border md:border-[#E5E2D8] overflow-hidden min-h-[100dvh] md:min-h-[700px]">
      
      {/* Header Navigation */}
      <nav id="app-nav" className="px-6 py-5 md:px-12 md:py-6 flex justify-between items-center border-b border-[#E5E2D8] bg-white/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#7D8B7D] rounded-full flex items-center justify-center text-white pb-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9V5a2 2 0 0 1 2-2h4"/>
              <path d="M16 3h4a2 2 0 0 1 2 2v4"/>
              <path d="M2 15v4a2 2 0 0 0 2 2h4"/>
              <path d="M16 21h4a2 2 0 0 0 2-2v4"/>
              <path d="M7 12h10"/>
              <path d="M12 7v10"/>
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight text-[#4A4A3F] font-serif">Library Scanner</span>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-2.5 items-center text-xs font-bold uppercase tracking-widest text-[#7D8B7D]">
            <span className="hidden sm:inline">AI Studio Direct</span>
            <div className="w-2 h-2 rounded-full bg-[#5A5A40] animate-pulse"></div>
          </div>
          <button 
            id="settings-toggle"
            onClick={() => setSettingsOpen(true)}
            className="p-2 hover:bg-[#FAF9F6] active:scale-95 transition-all rounded-full border border-[#E5E2D8] text-[#5A5A40] cursor-pointer"
            title="Connection Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main id="main-layout" className="flex-1 p-6 md:p-10 flex flex-col lg:flex-row gap-8 lg:gap-10">
        
        {/* Left/Preview Panel: Camera scan activator & Viewfinder */}
        <section id="scanner-interface" className="w-full lg:w-1/3 flex flex-col gap-6">
          <div className="flex-1 min-h-[300px] bg-[#2D2D2D] rounded-[44px] relative overflow-hidden flex items-center justify-center border border-[#E5E2D8]/30">
            {imagePreview ? (
              <div className="absolute inset-0 w-full h-full p-1.5">
                <img src={imagePreview} alt="Captured cover" className="w-full h-full object-cover rounded-[38px]" />
              </div>
            ) : cameraActive ? (
              <div className="absolute inset-0 w-full h-full">
                <video 
                   ref={videoRef}
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                {/* Visual crop overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-8">
                  <div className="flex justify-between">
                    <div className="w-6 h-6 border-t-2 border-l-2 border-white/80 rounded-tl"></div>
                    <div className="w-6 h-6 border-t-2 border-r-2 border-white/80 rounded-tr"></div>
                  </div>
                  <div className="w-full h-[1px] bg-[#7D8B7D]/40 animate-pulse"></div>
                  <div className="flex justify-between">
                    <div className="w-6 h-6 border-b-2 border-l-2 border-white/80 rounded-bl"></div>
                    <div className="w-6 h-6 border-b-2 border-r-2 border-white/80 rounded-br"></div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Fallback Viewfinder simulation using modern Unsplash book art */}
                <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800')] bg-cover bg-center"></div>
                <div className="absolute inset-0 border-[32px] border-black/30"></div>
                <div className="relative z-10 w-44 h-56 border-2 border-dashed border-white/40 rounded-2xl flex items-center justify-center">
                  <div className="w-full h-1 bg-white/20 absolute animate-pulse"></div>
                  <Camera className="w-8 h-8 text-white/50" />
                </div>
                <div className="absolute bottom-6 left-0 right-0 px-4 text-center">
                  <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">Posters & Covers Frame</p>
                </div>
              </>
            )}
          </div>

          {cameraActive ? (
            <button 
              id="camera-trigger-instant"
              onClick={handleCaptureFromStream}
              disabled={loading}
              className="w-full bg-[#5A5A40] text-white py-6 rounded-[32px] shadow-lg hover:bg-[#4D4D33] hover:shadow-xl active:scale-[0.98] transition-all flex flex-col items-center gap-1 group cursor-pointer disabled:opacity-50"
            >
              <span className="text-lg font-bold tracking-wide flex items-center gap-2">
                <Camera className="w-5 h-5" /> Capture Cover Instantly
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] opacity-60">Zero Approval Step</span>
            </button>
          ) : (
            <button 
              id="camera-trigger"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="w-full bg-[#5A5A40] text-white py-6 rounded-[32px] shadow-lg hover:bg-[#4A4A33] hover:shadow-xl active:scale-[0.98] transition-all flex flex-col items-center gap-1 group cursor-pointer disabled:opacity-50"
            >
              <span className="text-lg font-bold tracking-wide">Scan Book or Movie Cover</span>
              <span className="text-[10px] uppercase tracking-[0.2em] opacity-60">Trigger System Camera</span>
            </button>
          )}
        </section>

        {/* Right/Result Panel: Dynamic content readout */}
        <section id="insights-panel" className="flex-1 bg-white rounded-[40px] shadow-sm border border-[#E5E2D8] p-6 md:p-10 flex flex-col justify-between min-h-[350px]">
          
          {/* Default Unscanned State */}
          {!imagePreview && !loading && !result && !error && (
            <div className="flex-1 flex flex-col justify-center items-center text-center py-10 space-y-6">
              <div className="w-16 h-16 bg-[#F5F5F0] text-[#7D8B7D] rounded-full flex items-center justify-center border border-[#E5E2D8]">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                  <path d="M6 6h10"/>
                  <path d="M6 10h10"/>
                </svg>
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-serif text-[#4A4A3F] font-bold">Awaiting Scan</h3>
                <p className="text-[#7D8B7D] text-sm max-w-sm mx-auto leading-relaxed">
                  Provide a clean portrait image of any novel cover or theatrical film poster. Library Scanner will pull verified database scores.
                </p>
                {hasCameraPermission === false && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 inline-block">
                    Note: Live stream disabled. Using local device camera storage instead.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-5">
              <div className="relative">
                <div className="absolute inset-0 bg-[#7D8B7D]/15 rounded-full animate-ping opacity-75"></div>
                <div className="relative bg-[#F5F5F0] p-5 rounded-full shadow-inner border border-[#E5E2D8]">
                  <Loader2 className="w-8 h-8 text-[#7D8B7D] animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <span className="text-xs font-bold uppercase tracking-widest text-[#7D8B7D] animate-pulse">Running Grounded Search</span>
                <p className="text-[#5A5A40] text-sm max-w-[280px] font-serif italic text-center leading-relaxed">
                  Querying live catalogs to ensure exact up-to-date ratings...
                </p>
              </div>
            </div>
          )}

          {/* Error Message Case */}
          {error && (
            <div className="flex-1 flex flex-col justify-center items-center text-center py-10 space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center border border-red-100 font-bold">
                !
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-widest text-red-600">Scan Notice</span>
                <p className="text-[#2D2D2D] font-serif text-lg leading-relaxed max-w-md">{error}</p>
              </div>
            </div>
          )}

          {/* Dynamic Result Data Block */}
          {result && !loading && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                
                {/* Upper block: Identified media status */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-[#7D8B7D]">
                      {insight?.mediaType === 'book' ? 'Identified Book' : 'Identified Movie'}
                    </span>
                    <h2 className="text-3xl font-serif font-bold leading-tight text-[#2D2D2D]">
                      {insight?.title || 'Cover Identified'}
                    </h2>
                    {insight?.creator && (
                      <p className="text-[#7D8B7D] italic font-serif text-base">
                        {insight.mediaType === 'book' ? 'by ' : 'directed by '}{insight.creator}
                      </p>
                    )}
                  </div>
                  
                  {/* Score rating display card */}
                  <div className="bg-[#FAF9F6] border border-[#E5E2D8] px-5 py-3 rounded-2xl flex flex-col items-center self-start min-w-[120px]">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D]">
                      {insight?.mediaType === 'book' ? 'Goodreads' : 'IMDb rating'}
                    </span>
                    <span className="text-2xl font-serif font-bold text-[#5A5A40] mt-0.5">
                      {displayedRating}
                    </span>
                  </div>
                </div>

                <div className="h-[1px] bg-[#E5E2D8]"></div>

                {/* Structured Metadata Grid */}
                {insight ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {/* Genre */}
                    <div className="bg-[#FAF9F6]/80 p-4 rounded-xl border border-[#E5E2D8]/50">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] block mb-1">
                        Genre
                      </span>
                      <span className="font-serif text-[#4A4A3F] font-bold text-base">
                        {insight.genre || "N/A"}
                      </span>
                    </div>

                    {/* Theme */}
                    <div className="bg-[#FAF9F6]/80 p-4 rounded-xl border border-[#E5E2D8]/50">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] block mb-1">
                        Theme
                      </span>
                      <span className="font-serif text-[#4A4A3F] font-bold text-base">
                        {insight.theme || "N/A"}
                      </span>
                    </div>

                    {/* Choice: Release Year */}
                    <div className="bg-[#FAF9F6]/80 p-4 rounded-xl border border-[#E5E2D8]/50 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] block mb-1">
                        Catalog Info
                      </span>
                      <span className="font-serif text-[#4A4A3F] text-base font-semibold">
                        {insight.choice || "Release Date Verified"}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Strict Synopsis Block */}
                <div className="space-y-2 mt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#7D8B7D]">Synopsis Summary</span>
                  <p className="text-base font-serif leading-relaxed text-[#4A4A3F] italic bg-[#FAF9F6]/50 p-4 rounded-2xl border border-[#E5E2D8]/40">
                    {insight?.synopsis || result}
                  </p>
                </div>
              </div>

              {/* Action resets */}
              <div className="flex gap-4 mt-6 pt-6 border-t border-[#E5E2D8]">
                <button 
                  onClick={scanAnother}
                  className="flex-1 bg-[#F5F5F0] text-[#5A5A40] py-4 rounded-3xl font-semibold text-xs uppercase tracking-widest hover:bg-[#E5E2D8] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Scan Another
                </button>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* Footer Status Metadata */}
      <footer id="app-footer" className="px-6 py-5 md:px-12 md:py-5 border-t border-[#E5E2D8] flex flex-col sm:flex-row justify-between items-center bg-[#F5F5F0] gap-3 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#7D8B7D]"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#7D8B7D]"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#7D8B7D] opacity-30"></div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D]">
            Grounding Tool: Google Search Active
          </span>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] opacity-60">
          Core Engine: {selectedModel === 'gemini-3.5-flash' ? 'Gemini 3.5 Flash' : selectedModel === 'gemini-3.1-flash-lite' ? 'Gemini 3.1 Flash-Lite' : selectedModel === 'gemini-2.5-flash-lite' ? 'Gemini 2.5 Flash-Lite' : 'Gemini 2.5 Flash'}
        </div>
      </footer>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] border border-[#E5E2D8] shadow-2xl overflow-hidden flex flex-col p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-serif font-bold text-[#4A4A3F] flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#7D8B7D]" />
                App Connection
              </h3>
              <button 
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 hover:bg-[#FAF9F6] rounded-full text-[#7D8B7D] cursor-pointer border border-[#E5E2D8]/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] block">
                  Gemini Model
                </label>
                <div className="relative">
                  <select
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#E5E2D8] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#7D8B7D] text-[#2D2D2D] appearance-none cursor-pointer pr-10"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Grounding fallback active)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#7D8B7D]">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] block">
                  Google AI Studio API Key
                </label>
                <input
                  type="password"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder={getApiKey() ? "••••••••••••••••••••••••" : "Enter API Key"}
                  className="w-full bg-[#FAF9F6] border border-[#E5E2D8] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#7D8B7D] text-[#2D2D2D]"
                />
                <p className="text-[10px] text-[#7D8B7D] leading-relaxed font-sans">
                  {(import.meta as any).env?.VITE_GEMINI_API_KEY ? (
                    <span className="text-emerald-700 font-semibold">✓ Default key bundled from `.env` is active.</span>
                  ) : (
                    "API key from Google AI Studio. Supports search grounding for Goodreads/IMDb ratings."
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex-1 border border-[#E5E2D8] text-[#7D8B7D] py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[#FAF9F6] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveSettings(tempKey, tempModel)}
                className="flex-1 bg-[#5A5A40] text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[#4A4A33] hover:shadow-md transition-all cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden native triggers */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={fileInputRef}
        onChange={handleCapture}
        className="hidden" 
      />
    </div>
  );
}

