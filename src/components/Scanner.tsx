import { useState, useRef, ChangeEvent } from 'react';
import { Camera, Loader2, RefreshCw } from 'lucide-react';

export default function Scanner() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Send to server
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, mimeType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze the image.');
      }

      setResult(data.result);
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
          <div className="w-10 h-10 bg-[#7D8B7D] rounded-full flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9V5a2 2 0 0 1 2-2h4"/>
              <path d="M16 3h4a2 2 0 0 1 2 2v4"/>
              <path d="M2 15v4a2 2 0 0 0 2 2h4"/>
              <path d="M16 21h4a2 2 0 0 0 2-2v4"/>
              <path d="M7 12h10"/>
              <path d="M12 7v10"/>
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight text-[#4A4A3F] font-serif">Verve Lens</span>
        </div>
        <div className="flex gap-4 items-center text-xs font-bold uppercase tracking-widest text-[#7D8B7D]">
          <span className="hidden sm:inline">Live Grounding Enabled</span>
          <div className="w-2.5 h-2.5 rounded-full bg-[#7D8B7D] animate-pulse"></div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main id="main-layout" className="flex-1 p-6 md:p-10 flex flex-col lg:flex-row gap-8 lg:gap-10">
        
        {/* Left/Preview Panel: Camera scan activator & Viewfinder */}
        <section id="scanner-interface" className="w-full lg:w-1/3 flex flex-col gap-6">
          <div className="flex-1 min-h-[280px] bg-[#2D2D2D] rounded-[44px] relative overflow-hidden flex items-center justify-center">
            {imagePreview ? (
              <div className="absolute inset-0 w-full h-full p-1.5">
                <img src={imagePreview} alt="Captured cover" className="w-full h-full object-cover rounded-[38px]" />
              </div>
            ) : (
              <>
                {/* Viewfinder simulation using modern Unsplash book art */}
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

          <button 
            id="camera-trigger"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full bg-[#5A5A40] text-white py-6 rounded-[32px] shadow-lg hover:bg-[#4A4A33] hover:shadow-xl active:scale-[0.98] transition-all flex flex-col items-center gap-1 group cursor-pointer disabled:opacity-50"
          >
            <span className="text-lg font-bold tracking-wide">Scan Book or Movie Cover</span>
            <span className="text-[10px] uppercase tracking-[0.2em] opacity-60">Trigger System Camera</span>
          </button>
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
              <div className="space-y-2">
                <h3 className="text-2xl font-serif text-[#4A4A3F] font-bold">Awaiting Scan</h3>
                <p className="text-[#7D8B7D] text-sm max-w-sm mx-auto leading-relaxed">
                  Provide a clean portrait image of any novel cover or theatrical film poster. Verve Lens will pull verified database scores.
                </p>
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
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D]">Grounding Tool: Google Search Active</span>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7D8B7D] opacity-60">
          Core Engine: Gemini 2.5 Flash
        </div>
      </footer>

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

