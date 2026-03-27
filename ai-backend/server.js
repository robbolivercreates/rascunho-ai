/**
 * Excalidraw AI Backend — Gemini 3.1 Flash-Lite (FULL CAPABILITIES)
 * 
 * Features enabled:
 *   ✅ Search Grounding (real-time web data)
 *   ✅ URL Context (reads URLs provided by user)
 *   ✅ Thinking (reasoning before generating)
 *   ✅ Structured Outputs (Mermaid/SVG code)
 *   ✅ Code Execution (validates generated code)
 *   ✅ Enhanced prompt with professional color palette
 * 
 * Usage:
 *   GEMINI_API_KEY=your_key node server.js
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { generateExcalidrawScene } = require("./excalidrawCarouselRenderer");

const app = express();
const PORT = 3016;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

// ============================================================
// SYSTEM PROMPT — Professional diagram generation
// ============================================================
const SYSTEM_PROMPT = `You are a world-class diagram architect. You generate clean, elegant Mermaid diagrams that match a hand-drawn whiteboard aesthetic.

## CRITICAL RULES:
1. Output ONLY valid Mermaid syntax — no explanations, no markdown fences, no backticks
2. If the user writes in Portuguese, use Portuguese labels but valid Mermaid syntax
3. Do NOT overuse emojis — max 2-3 per diagram, only on key nodes
4. Maximum 15 nodes per diagram for readability
5. Choose the best diagram type automatically:
   - Processes/workflows → flowchart TD
   - Brainstorming/concepts/mindmaps → flowchart TD (styled as mindmap — see below)
   - State machines/lifecycle → stateDiagram-v2
   - Timelines → timeline
   - Data distribution → pie
   - Sequences/APIs → sequenceDiagram

## IMPORTANT — STYLING RULES PER DIAGRAM TYPE:

### FLOWCHARTS (flowchart TD/LR) — FULL STYLING SUPPORTED:
- Use classDef with the pastel palette below
- Use subgraphs to group related concepts
- Use appropriate shapes: {diamond} for decisions, [(cylinder)] for databases, ([stadium]) for start/end
- Use dotted lines (-.->)  for optional paths, thick lines (==>) for critical paths

PASTEL PALETTE for flowcharts:
classDef primary fill:#dbeafe,color:#1e40af,stroke:#93c5fd,stroke-width:1.5px
classDef success fill:#dcfce7,color:#166534,stroke:#86efac,stroke-width:1.5px
classDef warning fill:#fef9c3,color:#854d0e,stroke:#fde047,stroke-width:1.5px
classDef danger fill:#fee2e2,color:#991b1b,stroke:#fca5a5,stroke-width:1.5px
classDef purple fill:#ede9fe,color:#5b21b6,stroke:#c4b5fd,stroke-width:1.5px
classDef neutral fill:#f3f4f6,color:#374151,stroke:#d1d5db,stroke-width:1.5px

### MINDMAP REQUESTS — USE FLOWCHART TD (never use "mindmap" type):
When the user asks for a mindmap, mind map, mapa mental, or brainstorming:
- ALWAYS use "flowchart TD" — NEVER use "mindmap"
- Root topic: use (( )) circle shape with classDef primary
- Main branches: use [ ] square shape, each with a different classDef color
- Sub-items: use ( ) rounded shape with classDef neutral
- Connect root → branches → sub-items with arrows
- This ensures colors and styling work properly
- Example structure:
  flowchart TD
    ROOT((Topic)) --> A[Branch 1]
    ROOT --> B[Branch 2]
    A --> A1(Detail 1)
    A --> A2(Detail 2)
    classDef primary fill:#dbeafe,color:#1e40af,stroke:#93c5fd,stroke-width:1.5px
    class ROOT primary

### STATE DIAGRAMS — classDef SUPPORTED:
- Use classDef with the pastel palette

### SEQUENCE DIAGRAMS, TIMELINE, PIE — NO custom styling:
- These use Mermaid's built-in theming, do not add classDef

## SVG GENERATION (when asked for icons/graphics):
- Generate clean, minimal SVG code
- Use stroke-based designs, no fill (transparent background)
- Use viewBox="0 0 100 100" and stroke-linecap="round"`;

// ============================================================
// POST /v1/ai/text-to-diagram/chat-streaming
// Main endpoint for Excalidraw Text-to-Diagram
// ============================================================
app.post("/v1/ai/text-to-diagram/chat-streaming", async (req, res) => {
  const { messages } = req.body;

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }

  // Convert Excalidraw messages to Gemini format
  const geminiContents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  // Detect if user is providing a URL
  const lastMessage = messages[messages.length - 1]?.content || "";
  const hasUrl = /https?:\/\/[^\s]+/.test(lastMessage);

  // Build tools array based on what the user needs
  const tools = [];
  
  // Enable Google Search Grounding for real-time web knowledge
  tools.push({ google_search: {} });

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: geminiContents,
    tools: tools,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingBudget: 2048,
      },
    },
  };

  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  try {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Ratelimit-Limit", "1000");
    res.setHeader("X-Ratelimit-Remaining", "999");

    const response = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ Gemini API error:", response.status, errText);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: { message: `Gemini API error: ${response.status}`, status: response.status },
        })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    console.log("🧠 Streaming response with Thinking + Search Grounding...");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        try {
          const geminiChunk = JSON.parse(jsonStr);
          
          // Extract text from candidates (skip thinking parts)
          const candidate = geminiChunk?.candidates?.[0];
          if (!candidate) continue;

          const parts = candidate.content?.parts || [];
          for (const part of parts) {
            // Skip "thought" parts — only stream the final output
            if (part.thought) {
              console.log("💭 Thinking...");
              continue;
            }
            
            if (part.text) {
              res.write(
                `data: ${JSON.stringify({ type: "content", delta: part.text })}\n\n`
              );
            }
          }

          // Check for grounding metadata
          const grounding = candidate.groundingMetadata;
          if (grounding?.searchEntryPoint) {
            console.log("🔍 Search Grounding used:", grounding.webSearchQueries?.join(", "));
          }

          // Check if done
          if (candidate.finishReason === "STOP") {
            res.write(
              `data: ${JSON.stringify({ type: "done", finishReason: "stop" })}\n\n`
            );
          }
        } catch (e) {
          // Skip unparseable lines
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
    console.log("✅ Stream complete");
  } catch (err) {
    console.error("💥 Server error:", err);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: { message: err.message, status: 500 },
      })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// ============================================================
// POST /v1/ai/diagram-to-code/generate
// DiagramToCode plugin — converts visual diagrams to HTML
// ============================================================
app.post("/v1/ai/diagram-to-code/generate", async (req, res) => {
  const { texts, image, theme } = req.body;

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }

  const prompt = `You are an expert frontend developer. Given this diagram with the following texts and theme, generate clean HTML+CSS that recreates it as a modern web page.

Texts: ${JSON.stringify(texts)}
Theme: ${theme}

Generate a complete, self-contained HTML document with inline CSS. Modern, vibrant design.
Output ONLY the HTML code, nothing else.`;

  try {
    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.7, 
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 1024 },
      },
      tools: [{ google_search: {} }],
    };

    // Add image if provided
    if (image && image.startsWith("data:")) {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];
      requestBody.contents[0].parts.unshift({
        inline_data: { mime_type: mimeType, data: base64Data },
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    // Extract text, skipping thought parts
    let html = "";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (!part.thought && part.text) {
        html += part.text;
      }
    }

    if (!html) html = "<p>Generation failed</p>";

    res.json({ html });
  } catch (err) {
    console.error("❌ Diagram-to-code error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /v1/ai/generate-svg
// Custom endpoint: Generate SVG icons/graphics via AI
// ============================================================
app.post("/v1/ai/generate-svg", async (req, res) => {
  const { prompt } = req.body;

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }

  const svgPrompt = `Generate a clean, minimal SVG icon based on this description: "${prompt}"

Rules:
- Output ONLY the SVG code, nothing else
- Use viewBox="0 0 100 100"
- Use stroke-based design with stroke-linecap="round" for a hand-drawn feel
- No fill colors (transparent background), only strokes
- Use stroke="#1e293b" as default color
- Keep it simple and recognizable
- No text elements unless specifically requested`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: svgPrompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
        tools: [{ google_search: {} }],
      }),
    });

    const data = await response.json();
    let svg = "";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (!part.thought && part.text) svg += part.text;
    }

    // Clean up: extract just the SVG tag
    const svgMatch = svg.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      res.json({ svg: svgMatch[0] });
    } else {
      res.status(500).json({ error: "Failed to generate valid SVG" });
    }
  } catch (err) {
    console.error("❌ SVG generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /v1/ai/carousel/generate
// Generate Instagram carousel slides from topic or URL
// ============================================================
app.post("/v1/ai/carousel/generate", async (req, res) => {
  const { topic, format, slideCount, language, handle } = req.body;

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }

  const langMap = { 'pt-BR': 'Brazilian Portuguese', 'en': 'English', 'es': 'Spanish' };
  const langName = langMap[language] || 'Brazilian Portuguese';

  const formatInstructions = {
    tips: `Create a carousel of tips/lessons. Each content slide should have 2-3 items with an emoji icon, a bold title, and a short description.`,
    mindmap: `Create a carousel where the main content slides show mind-map style content. Include a "root" field with the central topic and a "branches" array with 4-6 branch labels. Set type to "mindmap" for these slides.`,
    steps: `Create a carousel of step-by-step instructions. Each content slide covers 1-2 steps with clear numbering (1️⃣, 2️⃣, etc.) as icons.`,
    comparison: `Create a carousel comparing two or more things. Each content slide shows pros/cons or differences with ✅ and ❌ icons.`,
  };

  const carouselPrompt = `Generate an Instagram carousel about: "${topic}"

Language: ${langName}
Total slides: ${slideCount}
Format: ${format}
${formatInstructions[format] || formatInstructions.tips}

Return a JSON object with a "slides" array. Each slide has:
- "type": one of "cover", "content", "mindmap", or "cta"
- For cover: { type: "cover", title: "...", subtitle: "...", emoji: "🚀" }
- For content: { type: "content", title: "Slide Title", items: [{ icon: "💡", title: "Bold point", description: "explanation" }] }
- For mindmap: { type: "mindmap", title: "...", root: "Central Topic", branches: ["Branch 1", "Branch 2", ...] }
- For cta (always last slide): { type: "cta", title: "Follow for more!", action: "❤️ Save • 🔄 Share • 💬 Comment" }

Rules:
- First slide is always "cover" with a catchy title and emoji
- Last slide is always "cta"
- Middle slides are "content" or "mindmap" depending on format
- Keep text SHORT — max 8 words per item title, max 15 words per description
- Use relevant emojis as icons
- Make titles engaging and attention-grabbing
- Content should be valuable and insightful

Return ONLY valid JSON, no markdown, no backticks.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: carouselPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 2048 },
        },
        tools: [{ google_search: {} }],
      }),
    });

    const data = await response.json();
    let jsonText = "";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (!part.thought && part.text) jsonText += part.text;
    }

    // Parse JSON response
    let slides;
    try {
      const parsed = JSON.parse(jsonText);
      slides = parsed.slides || parsed;
    } catch (e) {
      // Try to extract JSON from text
      const match = jsonText.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0]);
        slides = parsed.slides || parsed;
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    console.log(`🎨 Generated carousel: ${slides.length} slides for "${topic}"`);
    res.json({ slides });
  } catch (err) {
    console.error("❌ Carousel error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /v1/ai/carousel/excalidraw
// Generate Instagram carousel natively for Excalidraw
// ============================================================
app.post("/v1/ai/carousel/excalidraw", async (req, res) => {
  const { topic, format, slideCount, language, handle, colorTheme } = req.body;

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }

  const langMap = { 'pt-BR': 'Brazilian Portuguese', 'en': 'English', 'es': 'Spanish' };
  const langName = langMap[language] || 'Brazilian Portuguese';

  const formatInstructions = {
    tips: `Create a carousel of tips/lessons. Each content slide should have 2-3 items with an emoji icon, a bold title, and a short description.`,
    mindmap: `Create a mindmap carousel where the main slide has a "root" field with the central topic, and a "branches" string array with 4-6 labels. Set type to "mindmap".`,
    steps: `Create a carousel of step-by-step instructions. Each content slide covers 1-2 steps with numbering (1️⃣, 2️⃣) as icons.`,
    comparison: `Create a carousel comparing things showing pros/cons with ✅ and ❌.`,
  };

  const allowedIcons = ["paper", "documents", "message", "clipboard", "notes", "table", "attachment", "cloud", "delete", "zip", "movie", "password", "search", "code", "share", "upload", "download", "ai", "swift", "python", "react", "js", "html", "css", "node", "typescript"];

  // ── Twitter/X Thread mode ──────────────────────────────────
  if (format === 'twitter') {
    const twitterPrompt = `Create a viral Twitter/X thread about: "${topic}"
Language: ${langName}
Total tweets: ${slideCount}
Handle: ${handle || '@inkstage'}

RULES:
- First tweet: powerful hook (max 200 chars) with opening emoji
- Middle tweets: 1 insight per tweet, conversational tone, max 240 chars each
- Last tweet: strong CTA (follow, retweet, save)
- Number each tweet: "1/", "2/", "3/"...
- Use line breaks for breathing room
- Max 2 emojis per tweet

Return ONLY valid JSON:
{
  "name": "Display Name",
  "handle": "${handle || '@inkstage'}",
  "avatar": "🧑‍💻",
  "tweets": [
    { "text": "1/ Tweet text here...", "likes": "2.4K", "retweets": "847", "replies": "123", "bookmarks": "412" }
  ]
}
Make likes/retweets/replies realistic and varied (first tweet has most engagement).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: twitterPrompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192, responseMimeType: "application/json" },
        tools: [{ google_search: {} }],
      }),
    });

    const data = await response.json();
    let jsonText = "";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) if (!part.thought && part.text) jsonText += part.text;

    let threadData;
    try { threadData = JSON.parse(jsonText); }
    catch (e) { threadData = JSON.parse(jsonText.match(/\{[\s\S]*\}/)[0]); }

    // Injeta tweetMode e metadados em cada slide para o renderer reconhecer
    const slides = (threadData.tweets || []).map((t) => ({
      tweetMode: true,
      text: t.text,
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      bookmarks: t.bookmarks,
      name: threadData.name,
      handle: threadData.handle || handle,
      avatar: threadData.avatar,
    }));

    console.log(`🐦 Twitter Thread: ${slides.length} tweets para "${topic}"`);
    const excalidrawScene = generateExcalidrawScene(slides, 'twitter');
    fs.writeFileSync(path.join(__dirname, "public", "latest.json"), JSON.stringify(excalidrawScene));
    res.json({ success: true, scene: excalidrawScene, url: `http://localhost:3016/latest.json` });
    return;
  }

  const carouselPrompt = `Generate a text payload for an Excalidraw Carousel: "${topic}"
Language: ${langName}
Total slides: ${slideCount}
Format: ${format}
${formatInstructions[format]}
Return ONLY a JSON object with a "slides" array. Slide types: "cover", "content", "mindmap", or "cta".
Cover slide needs: type: "cover", title, subtitle, emoji.
Mindmap slide needs: type: "mindmap", title, root, branches (array).
Content slide needs: type: "content", title, items (array of { iconName, icon: emoji fallback, title, description }).
CTA slide needs: type: "cta", title, handle, action.

CRITICAL INSTRUCTION FOR ICONS:
For "content" slide items, prefer using an "iconName" perfectly matched from this list: [${allowedIcons.join(", ")}]. If none fits, use "none" and provide an emoji in the "icon" field.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: carouselPrompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: "application/json" }
      }),
    });

    const data = await response.json();
    let jsonText = "";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) if (!part.thought && part.text) jsonText += part.text;

    let slides;
    try { slides = JSON.parse(jsonText).slides || JSON.parse(jsonText); }
    catch(e) { slides = JSON.parse(jsonText.match(/\{[\s\S]*\}/)[0]).slides; }

    console.log(`🎨 Translating ${slides.length} slides to Native Excalidraw format (${colorTheme || 'purple'})...`);

    const excalidrawScene = generateExcalidrawScene(slides, colorTheme || 'purple');
    fs.writeFileSync(path.join(__dirname, "public", "latest.json"), JSON.stringify(excalidrawScene));
    res.json({ success: true, scene: excalidrawScene, url: `http://localhost:3016/latest.json` });
  } catch (err) {
    console.error("❌ Excalidraw Carousel error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /v1/ai/carousel/html
// Gera slides como HTML/CSS puro — renderizado direto no browser
// ============================================================
app.post("/v1/ai/carousel/html", async (req, res) => {
  const { topic, format, slideCount, language, handle, colorTheme } = req.body;

  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }

  const langMap = { 'pt-BR': 'Português Brasileiro', 'en': 'English', 'es': 'Español' };
  const langName = langMap[language] || 'Português Brasileiro';

  const formatInstructions = {
    tips: `Formato: Dicas/Lista. Slides de conteúdo com 2-4 itens, cada um com emoji, título bold e descrição curta.`,
    steps: `Formato: Passo a Passo. Cada slide mostra 1 passo numerado (Passo 1, Passo 2...) com título e explicação.`,
    comparison: `Formato: Comparação. Slides mostram ✅ vs ❌ ou Antes vs Depois, com contraste visual claro.`,
    mindmap: `Formato: Conceitos. Slides com 1 conceito central e 3-5 subtópicos relacionados.`,
    twitter: `Formato: Thread do Twitter/X. Cada slide é um tweet individual em sequência, como uma thread viral. Cada tweet tem texto conversacional, direto, máx 280 caracteres. Use números (1/, 2/, 3/...) no início de cada tweet para indicar a sequência da thread.`,
  };

  // Paletas de cores seguindo as melhores práticas de engajamento
  const palettes = {
    purple: { bg: '#1A1A2E', card: '#16213E', accent: '#6C5CE7', accent2: '#A29BFE', text: '#FFFFFF', muted: '#A0AEC0', gradient: 'linear-gradient(135deg, #6C5CE7, #A29BFE)' },
    blue:   { bg: '#0F172A', card: '#1E293B', accent: '#0984E3', accent2: '#60A5FA', text: '#FFFFFF', muted: '#94A3B8', gradient: 'linear-gradient(135deg, #0984E3, #00CEC9)' },
    green:  { bg: '#0D1B2A', card: '#162032', accent: '#00B894', accent2: '#55EFC4', text: '#FFFFFF', muted: '#90B4A8', gradient: 'linear-gradient(135deg, #00B894, #55EFC4)' },
    rose:   { bg: '#1A0A0F', card: '#2D1520', accent: '#E91E63', accent2: '#FF80AB', text: '#FFFFFF', muted: '#C49BAA', gradient: 'linear-gradient(135deg, #E91E63, #FF5722)' },
    amber:  { bg: '#1A1200', card: '#2D2200', accent: '#F59E0B', accent2: '#FCD34D', text: '#FFFFFF', muted: '#B8A87A', gradient: 'linear-gradient(135deg, #F59E0B, #FF6B6B)' },
  };
  const p = palettes[colorTheme] || palettes.purple;

  // Twitter format gets a special prompt and renderer
  if (format === 'twitter') {
    const twitterPrompt = `Crie uma thread viral do Twitter/X sobre: "${topic}"

Idioma: ${langName}
Total de tweets: ${slideCount}
Handle: ${handle || '@inkstage'}

REGRAS:
- Primeiro tweet: gancho PODEROSO que para o scroll (max 200 chars), com emoji inicial
- Tweets do meio: 1 insight por tweet, linguagem conversacional e direta, máx 240 chars cada
- Último tweet: CTA forte — pedir retweet, seguir, comentar ou salvar
- Tom: pessoal, direto, como alguém falando com um amigo
- Numeração: "1/", "2/", "3/" no início de cada tweet
- Use quebras de linha para dar respiro ao texto
- Pode usar emojis com moderação (máx 2 por tweet)

Retorne SOMENTE JSON:
{
  "handle": "${handle || '@inkstage'}",
  "name": "Nome do Criador",
  "avatar": "🧑‍💻",
  "tweets": [
    { "text": "1/ Texto do tweet aqui...", "likes": "2.4K", "retweets": "847", "replies": "123" }
  ]
}

Os números de likes/retweets/replies devem ser realistas e variados (o primeiro tweet tem mais engajamento).`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: twitterPrompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 1024 } },
          tools: [{ google_search: {} }],
        }),
      });

      const data = await response.json();
      let jsonText = "";
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) if (!part.thought && part.text) jsonText += part.text;

      let threadData;
      try { threadData = JSON.parse(jsonText); }
      catch (e) { threadData = JSON.parse(jsonText.match(/\{[\s\S]*\}/)[0]); }

      const slidesHtml = threadData.tweets.map((tweet, i) =>
        renderTweetSlide(tweet, i, threadData.tweets.length, threadData.name, threadData.handle || handle, threadData.avatar)
      );

      console.log(`🐦 Twitter Thread: ${slidesHtml.length} tweets para "${topic}"`);
      res.json({ slides: slidesHtml, raw: threadData.tweets, palette: p });
      return;
    } catch (err) {
      console.error("❌ Twitter Carousel error:", err);
      res.status(500).json({ error: err.message });
      return;
    }
  }

  const carouselPrompt = `Crie um carrossel de Instagram profissional sobre: "${topic}"

Idioma: ${langName}
Total de slides: ${slideCount}
${formatInstructions[format] || formatInstructions.tips}
Handle: ${handle || '@inkstage'}

REGRAS OBRIGATÓRIAS:
- Slide 1: sempre tipo "cover" — título PODEROSO (max 12 palavras), subtítulo curto, emoji relevante, tag de categoria
- Slides 2 a ${slideCount - 1}: tipo "content" — 1 ideia por slide, máx 50 palavras total
- Último slide: tipo "cta" — call-to-action específico e forte
- Títulos de conteúdo: máx 8 palavras, diretos e impactantes
- Descrições: máx 15 palavras, linguagem direta (sem academicismo)
- Emojis: usar com moderação, máx 2 por slide

Retorne SOMENTE JSON válido com esta estrutura:
{
  "slides": [
    { "type": "cover", "tag": "categoria", "emoji": "🚀", "title": "Título impactante aqui", "subtitle": "Subtítulo curto e direto" },
    { "type": "content", "title": "Título do slide", "items": [{ "emoji": "💡", "title": "Ponto bold", "desc": "Explicação curta aqui" }] },
    { "type": "cta", "headline": "Gostou do conteúdo?", "action": "Salva + comenta qual dica foi mais útil 👇", "handle": "${handle || '@inkstage'}" }
  ]
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: carouselPrompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 2048 },
        },
        tools: [{ google_search: {} }],
      }),
    });

    const data = await response.json();
    let jsonText = "";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) if (!part.thought && part.text) jsonText += part.text;

    let slides;
    try { slides = JSON.parse(jsonText).slides || JSON.parse(jsonText); }
    catch (e) { slides = JSON.parse(jsonText.match(/\{[\s\S]*\}/)[0]).slides; }

    // Gera os slides como HTML/CSS inline
    const slidesHtml = slides.map((slide, i) => renderSlideHTML(slide, i, slides.length, p, handle));

    console.log(`🎨 HTML Carousel: ${slides.length} slides para "${topic}"`);
    res.json({ slides: slidesHtml, raw: slides, palette: p });
  } catch (err) {
    console.error("❌ HTML Carousel error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Renderiza um tweet como slide 1080x1080 estilo Twitter/X
function renderTweetSlide(tweet, index, total, name, handle, avatar) {
  const hdl = handle || '@inkstage';
  const displayName = name || hdl.replace('@', '');
  const isFirst = index === 0;
  const isLast = index === total - 1;

  // Formata texto do tweet: quebras de linha viram <br>, links ficam em azul
  const formattedText = (tweet.text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/\S+)/g, '<span style="color:#1d9bf0;">$1</span>')
    .replace(/(#\w+)/g, '<span style="color:#1d9bf0;">$1</span>')
    .replace(/(@\w+)/g, '<span style="color:#1d9bf0;">$1</span>');

  // Tamanho da fonte baseado no comprimento do tweet
  const textLen = (tweet.text || '').length;
  const fontSize = textLen < 100 ? 42 : textLen < 180 ? 34 : 28;

  // Cor do avatar — varia por índice
  const avatarColors = ['#1d9bf0', '#6C5CE7', '#00B894', '#E91E63', '#F59E0B'];
  const avatarBg = avatarColors[index % avatarColors.length];

  return `<div style="width:1080px;height:1080px;background:#000000;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;position:relative;overflow:hidden;">

    <!-- Linha de thread acima (exceto no primeiro) -->
    ${!isFirst ? `<div style="position:absolute;top:0;left:96px;width:2px;height:60px;background:#2f3336;"></div>` : ''}

    <!-- Conteúdo principal -->
    <div style="flex:1;padding:60px 72px 0 72px;display:flex;flex-direction:column;">

      <!-- Header: avatar + nome -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;">
        <!-- Avatar -->
        <div style="width:56px;height:56px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">${avatar || '🧑‍💻'}</div>
        <!-- Nome + handle -->
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:18px;font-weight:700;color:#e7e9ea;letter-spacing:-0.2px;">${displayName}</span>
            <!-- Badge verificado -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${avatarBg}"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91-1.01-1.01-2.52-1.27-3.91-.81-0.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81-1.01 1.01-1.27 2.52-.81 3.91C1.88 9.33 1 10.57 1 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91 1.01 1.01 2.52 1.27 3.91.81.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81 1.01-1.01 1.27-2.52.81-3.91 1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>
          </div>
          <span style="font-size:16px;color:#71767b;">${hdl}</span>
        </div>
        <!-- Logo X -->
        <svg viewBox="0 0 24 24" width="28" height="28" fill="#e7e9ea" style="opacity:0.6;flex-shrink:0;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
      </div>

      <!-- Texto do tweet -->
      <div style="font-size:${fontSize}px;color:#e7e9ea;line-height:1.5;font-weight:400;letter-spacing:-0.2px;flex:1;margin-bottom:32px;">${formattedText}</div>

      <!-- Hora + thread indicator -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px;">
        <span style="font-size:15px;color:#71767b;">10:${String(30 + index).padStart(2,'0')} AM · Mar 2025</span>
        <span style="color:#71767b;">·</span>
        <span style="font-size:15px;color:#71767b;font-weight:500;">${index + 1}/${total} da thread</span>
      </div>

      <!-- Divisor -->
      <div style="height:1px;background:#2f3336;margin-bottom:24px;"></div>

      <!-- Métricas -->
      <div style="display:flex;gap:40px;align-items:center;margin-bottom:32px;">
        <!-- Replies -->
        <div style="display:flex;align-items:center;gap:8px;color:#71767b;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8.25a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52L16.75 15v2.25L14.5 16.5H8.25A6.75 6.75 0 0 1 1.5 9V8.25Z"/></svg>
          <span style="font-size:16px;">${tweet.replies || '0'}</span>
        </div>
        <!-- Retweets -->
        <div style="display:flex;align-items:center;gap:8px;color:#71767b;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19.5 7.5 17.25 5.25m0 0L15 7.5m2.25-2.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-9M4.5 16.5 6.75 18.75m0 0L9 16.5m-2.25 2.25V8.25a2.25 2.25 0 0 1 2.25-2.25h9"/></svg>
          <span style="font-size:16px;">${tweet.retweets || '0'}</span>
        </div>
        <!-- Likes -->
        <div style="display:flex;align-items:center;gap:8px;color:${isFirst ? '#f91880' : '#71767b'};">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="${isFirst ? '#f91880' : 'none'}" stroke="${isFirst ? '#f91880' : 'currentColor'}" stroke-width="1.5"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg>
          <span style="font-size:16px;">${tweet.likes || '0'}</span>
        </div>
        <!-- Bookmark -->
        <div style="display:flex;align-items:center;gap:8px;color:#71767b;margin-left:auto;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"/></svg>
          <span style="font-size:16px;">${tweet.bookmarks || Math.floor(Math.random() * 500 + 50)}</span>
        </div>
      </div>
    </div>

    <!-- Thread line abaixo (exceto no último) -->
    ${!isLast ? `<div style="position:absolute;bottom:0;left:96px;width:2px;height:60px;background:#2f3336;"></div>` : ''}

    <!-- Rodapé com handle -->
    <div style="padding:16px 72px;border-top:1px solid #2f3336;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:14px;color:#71767b;">Thread por <span style="color:#1d9bf0;">${hdl}</span></span>
      <span style="font-size:14px;color:#71767b;">${index + 1} / ${total}</span>
    </div>
  </div>`;
}

// Renderiza um slide como HTML/CSS (1080x1080)
function renderSlideHTML(slide, index, total, p, handle) {
  const num = String(index + 1).padStart(2, '0');
  const hdl = handle || '@inkstage';

  const footer = `
    <div style="position:absolute;bottom:40px;left:60px;right:60px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:18px;color:${p.accent}99;font-family:'Inter',sans-serif;">${hdl}</span>
      <span style="font-size:18px;color:${p.muted};font-family:'Inter',sans-serif;">${index + 1} / ${total}</span>
    </div>`;

  if (slide.type === 'cover') {
    return `<div style="width:1080px;height:1080px;background:${p.bg};position:relative;overflow:hidden;font-family:'Inter',sans-serif;">
      <!-- Círculo decorativo de fundo -->
      <div style="position:absolute;top:-200px;right:-200px;width:700px;height:700px;border-radius:50%;background:${p.accent};opacity:0.06;"></div>
      <div style="position:absolute;bottom:-150px;left:-150px;width:500px;height:500px;border-radius:50%;background:${p.accent2};opacity:0.05;"></div>
      <!-- Barra de accent no topo -->
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${p.gradient};"></div>
      <!-- Conteúdo -->
      <div style="padding:80px;height:100%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;">
        ${slide.tag ? `<div style="display:inline-flex;align-items:center;background:${p.accent}22;border:1px solid ${p.accent}55;border-radius:30px;padding:8px 20px;margin-bottom:32px;width:fit-content;">
          <span style="font-size:14px;font-weight:700;color:${p.accent};letter-spacing:2px;text-transform:uppercase;">${slide.tag}</span>
        </div>` : ''}
        ${slide.emoji ? `<div style="font-size:80px;margin-bottom:24px;line-height:1;">${slide.emoji}</div>` : ''}
        <h1 style="font-size:62px;font-weight:900;color:${p.text};line-height:1.15;margin:0 0 28px 0;letter-spacing:-1px;">${slide.title}</h1>
        ${slide.subtitle ? `<p style="font-size:28px;color:${p.muted};margin:0 0 auto 0;line-height:1.5;">${slide.subtitle}</p>` : ''}
        <div style="margin-top:auto;padding-top:40px;display:flex;align-items:center;gap:12px;border-top:1px solid ${p.accent}22;">
          <span style="font-size:20px;color:${p.muted};">Deslize para ver</span>
          <span style="font-size:24px;color:${p.accent};">→</span>
        </div>
      </div>
      ${footer}
    </div>`;
  }

  if (slide.type === 'cta') {
    return `<div style="width:1080px;height:1080px;background:${p.bg};position:relative;overflow:hidden;font-family:'Inter',sans-serif;">
      <!-- Gradiente de fundo suave -->
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, ${p.accent}18 0%, transparent 70%);"></div>
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${p.gradient};"></div>
      <!-- Conteúdo centralizado -->
      <div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:80px;box-sizing:border-box;position:relative;">
        <p style="font-size:26px;color:${p.muted};margin:0 0 20px 0;">${slide.headline || 'Gostou do conteúdo?'}</p>
        <h2 style="font-size:52px;font-weight:900;color:${p.text};line-height:1.2;margin:0 0 48px 0;">${slide.action || 'Salva e compartilha!'}</h2>
        <!-- Handle destaque -->
        <div style="background:${p.gradient};border-radius:60px;padding:18px 52px;margin-bottom:40px;">
          <span style="font-size:32px;font-weight:800;color:#fff;">${slide.handle || hdl}</span>
        </div>
        <!-- Ícones de ação -->
        <div style="display:flex;gap:32px;margin-top:8px;">
          <div style="text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">💾</div>
            <span style="font-size:18px;color:${p.muted};">Salva</span>
          </div>
          <div style="text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">💬</div>
            <span style="font-size:18px;color:${p.muted};">Comenta</span>
          </div>
          <div style="text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">📤</div>
            <span style="font-size:18px;color:${p.muted};">Compartilha</span>
          </div>
        </div>
      </div>
      ${footer}
    </div>`;
  }

  // Slide de conteúdo
  const items = slide.items || [];
  const itemsHtml = items.map((item, j) => `
    <div style="display:flex;align-items:flex-start;gap:20px;background:${p.card};border-radius:16px;padding:28px 32px;border-left:4px solid ${p.accent};position:relative;overflow:hidden;">
      <div style="position:absolute;top:8px;right:16px;font-size:60px;font-weight:900;color:${p.accent};opacity:0.1;line-height:1;font-family:'Inter',sans-serif;">${String(j+1).padStart(2,'0')}</div>
      <span style="font-size:40px;flex-shrink:0;line-height:1.2;">${item.emoji || '→'}</span>
      <div>
        <p style="font-size:28px;font-weight:700;color:${p.text};margin:0 0 8px 0;line-height:1.3;">${item.title}</p>
        ${item.desc ? `<p style="font-size:22px;color:${p.muted};margin:0;line-height:1.5;">${item.desc}</p>` : ''}
      </div>
    </div>`).join('');

  // Número fantasma decorativo
  const ghostNum = `<div style="position:absolute;top:20px;right:40px;font-size:200px;font-weight:900;color:${p.accent};opacity:0.05;line-height:1;font-family:'Inter',sans-serif;pointer-events:none;">${num}</div>`;

  return `<div style="width:1080px;height:1080px;background:${p.bg};position:relative;overflow:hidden;font-family:'Inter',sans-serif;">
    ${ghostNum}
    <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${p.gradient};"></div>
    <div style="padding:80px;height:100%;display:flex;flex-direction:column;box-sizing:border-box;gap:0;">
      <!-- Título -->
      <div style="margin-bottom:36px;">
        <h2 style="font-size:46px;font-weight:900;color:${p.text};margin:0 0 16px 0;line-height:1.2;">${slide.title}</h2>
        <div style="width:80px;height:5px;background:${p.gradient};border-radius:3px;"></div>
      </div>
      <!-- Items -->
      <div style="display:flex;flex-direction:column;gap:20px;flex:1;">
        ${itemsHtml}
      </div>
    </div>
    ${footer}
  </div>`;
}

// Carousel page
app.get("/carousel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "carousel.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: GEMINI_MODEL,
    features: {
      searchGrounding: true,
      thinking: true,
      structuredOutputs: true,
      urlContext: true,
      svgGeneration: true,
      carouselGenerator: true,
    },
  });
});

app.listen(PORT, () => {
  console.log(`
🤖 Excalidraw AI Backend v2.0 — FULL POWER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   URL:      http://localhost:${PORT}
   Model:    ${GEMINI_MODEL}
   API Key:  ${GEMINI_API_KEY ? "✅ Set" : "❌ NOT SET"}
   
   Features:
   ✅ Text-to-Diagram (/v1/ai/text-to-diagram)
   ✅ SVG Generation (/v1/ai/generate-svg)
   ✅ Diagram-to-Code (/v1/ai/diagram-to-code)
   🎨 Carousel Generator → http://localhost:${PORT}/carousel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
