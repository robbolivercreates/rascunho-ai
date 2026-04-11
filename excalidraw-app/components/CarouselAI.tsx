import { useState, useCallback, useEffect } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { syncInvalidIndices } from "@excalidraw/element";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const AI_BACKEND = import.meta.env.VITE_APP_AI_BACKEND || "http://localhost:3016";

// ════════════════════════════════════════════════════════════════
// CarouselAI — Generates Instagram Carousel natively on Canvas
// iPad-compatible: touch targets, safe areas, virtual keyboard
// ════════════════════════════════════════════════════════════════

interface CarouselAIButtonProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

export const CarouselAIButton = ({ excalidrawAPI }: CarouselAIButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("tips");
  const [color, setColor] = useState("purple");
  const [slideCount, setSlideCount] = useState("7");
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Detect virtual keyboard on iPad/mobile via visualViewport API
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const onResize = () => {
      const keyboardUp = viewport.height < window.innerHeight * 0.75;
      setKeyboardVisible(keyboardUp);
    };

    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);

  const generate = useCallback(async () => {
    if (!topic.trim()) return;
    setIsLoading(true);

    try {
      const endpoint = format === "twitter"
        ? `${AI_BACKEND}/v1/ai/carousel/excalidraw`
        : `${AI_BACKEND}/v1/ai/carousel/excalidraw`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          format,
          slideCount,
          language: "pt-BR",
          handle: "@inkstage",
          colorTheme: color,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const scene = data.scene || data;
      const rawElements = scene.elements || [];

      if (rawElements.length === 0) {
        throw new Error("Nenhum elemento gerado");
      }

      const restoredElements = restoreElements(rawElements, null, {
        repairBindings: true,
      });

      const allElements = [
        ...excalidrawAPI.getSceneElementsIncludingDeleted(),
        ...restoredElements,
      ];

      const orderedElements = syncInvalidIndices(allElements);

      excalidrawAPI.updateScene({
        elements: orderedElements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      excalidrawAPI.scrollToContent(restoredElements, { fitToViewport: true, animate: true });

      setIsOpen(false);
      setTopic("");

      excalidrawAPI.setToast({
        message: `🎨 Carrossel criado! ${restoredElements.length} elementos desenhados no canvas.`,
        closable: true,
        duration: 4000,
      });

    } catch (err: any) {
      excalidrawAPI.setToast({
        message: `❌ Erro: ${err.message}`,
        closable: true,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  }, [topic, format, color, slideCount, excalidrawAPI]);

  const formats = [
    { id: "tips", label: "📋 Dicas" },
    { id: "mindmap", label: "🧠 Mind Map" },
    { id: "steps", label: "📖 Passos" },
    { id: "comparison", label: "⚖️ Comparar" },
    { id: "twitter", label: "𝕏 Thread", fullWidth: true },
  ];

  const colors = [
    { id: "purple", bg: "#c084fc" },
    { id: "blue", bg: "#60a5fa" },
    { id: "green", bg: "#34d399" },
    { id: "rose", bg: "#fb7185" },
    { id: "amber", bg: "#fbbf24" },
  ];

  return (
    <>
      {/* Inject iPad-specific styles */}
      <style>{`
        .carousel-ai-fab {
          position: fixed;
          bottom: calc(24px + env(safe-area-inset-bottom, 0px));
          right: calc(24px + env(safe-area-inset-right, 0px));
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
          border: none;
          color: #fff;
          font-size: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(139,92,246,0.4);
          z-index: 1000;
          transition: transform 0.15s;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .carousel-ai-fab:active {
          transform: scale(0.95);
        }
        @media (hover: hover) and (pointer: fine) {
          .carousel-ai-fab:hover {
            transform: scale(1.08);
          }
        }

        .carousel-ai-panel {
          position: fixed;
          right: calc(24px + env(safe-area-inset-right, 0px));
          width: min(320px, calc(100vw - 48px));
          max-height: calc(100vh - 100px - env(safe-area-inset-bottom, 0px));
          max-height: calc(100dvh - 100px - env(safe-area-inset-bottom, 0px));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          background: #1a1a2e;
          border-radius: 16px;
          border: 1px solid #3f3f46;
          padding: 20px;
          z-index: 1001;
          box-shadow: 0 12px 48px rgba(0,0,0,0.5);
          font-family: 'Inter', system-ui, sans-serif;
          color: #fafafa;
          -webkit-tap-highlight-color: transparent;
        }
        .carousel-ai-panel.keyboard-up {
          bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          max-height: 60dvh;
        }
        .carousel-ai-panel:not(.keyboard-up) {
          bottom: calc(84px + env(safe-area-inset-bottom, 0px));
        }

        .carousel-ai-close {
          background: none;
          border: none;
          color: #71717a;
          font-size: 18px;
          cursor: pointer;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          margin: -8px -8px -8px 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .carousel-ai-close:active {
          background: rgba(255,255,255,0.05);
        }

        .carousel-ai-format-btn {
          background: #27272a;
          border: 1.5px solid #3f3f46;
          border-radius: 8px;
          padding: 10px 8px;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          min-height: 44px;
        }
        .carousel-ai-format-btn.selected {
          background: rgba(139,92,246,0.15);
          border-color: #8b5cf6;
          color: #c4b5fd;
        }
        .carousel-ai-format-btn.selected.twitter {
          background: rgba(29,155,240,0.15);
          border-color: #1d9bf0;
          color: #60c8ff;
        }

        .carousel-ai-color {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2.5px solid transparent;
          cursor: pointer;
          transition: all 0.12s;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          padding: 0;
          background: none;
        }
        .carousel-ai-color.selected {
          border-color: #fff;
          transform: scale(1.1);
        }

        .carousel-ai-generate {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          min-height: 48px;
        }
        .carousel-ai-generate:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .carousel-ai-generate.loading {
          background: #4c1d95;
          cursor: wait;
        }
      `}</style>

      {/* Floating Action Button */}
      <button
        className="carousel-ai-fab"
        onClick={() => setIsOpen(!isOpen)}
        title="Gerar Carrossel com IA"
        aria-label="Gerar Carrossel com IA"
      >
        🎠
      </button>

      {/* Panel */}
      {isOpen && (
        <div className={`carousel-ai-panel ${keyboardVisible ? "keyboard-up" : ""}`}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                borderRadius: "8px",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
              }}>🎨</span>
              <span style={{ fontWeight: 700, fontSize: "15px" }}>Carousel AI</span>
            </div>
            <button
              className="carousel-ai-close"
              onClick={() => setIsOpen(false)}
              aria-label="Fechar painel"
            >✕</button>
          </div>

          {/* Topic */}
          <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa", letterSpacing: "0.06em" }}>Tema</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex: 5 formas de ganhar dinheiro com IA..."
            style={{
              width: "100%",
              background: "#27272a",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              padding: "10px",
              color: "#fafafa",
              fontSize: "16px",
              fontFamily: "inherit",
              marginTop: "6px",
              marginBottom: "12px",
              resize: "vertical",
              minHeight: "60px",
              boxSizing: "border-box",
            }}
          />

          {/* Format */}
          <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa", letterSpacing: "0.06em" }}>Formato</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "6px", marginBottom: "12px" }}>
            {formats.map((f) => (
              <button
                key={f.id}
                className={`carousel-ai-format-btn ${format === f.id ? "selected" : ""} ${f.id === "twitter" ? "twitter" : ""}`}
                onClick={() => setFormat(f.id)}
                style={{
                  gridColumn: (f as any).fullWidth ? "span 2" : undefined,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Color + Count */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "14px", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa", letterSpacing: "0.06em" }}>Cor</label>
              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                {colors.map((c) => (
                  <button
                    key={c.id}
                    className={`carousel-ai-color ${color === c.id ? "selected" : ""}`}
                    onClick={() => setColor(c.id)}
                    aria-label={`Cor ${c.id}`}
                  >
                    <span style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: c.bg,
                    }} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa", letterSpacing: "0.06em" }}>Slides</label>
              <select
                value={slideCount}
                onChange={(e) => setSlideCount(e.target.value)}
                style={{
                  display: "block",
                  marginTop: "6px",
                  background: "#27272a",
                  border: "1px solid #3f3f46",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  color: "#fafafa",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  minHeight: "44px",
                }}
              >
                <option value="5">5</option>
                <option value="7">7</option>
                <option value="10">10</option>
              </select>
            </div>
          </div>

          {/* Generate */}
          <button
            className={`carousel-ai-generate ${isLoading ? "loading" : ""}`}
            onClick={generate}
            disabled={isLoading || !topic.trim()}
          >
            {isLoading ? "⏳ Desenhando no canvas..." : "🪄 Gerar Carrossel no Canvas"}
          </button>

          <div style={{ textAlign: "center", fontSize: "10px", color: "#52525b", marginTop: "8px" }}>
            Os slides serão desenhados diretamente no Excalidraw
          </div>
        </div>
      )}
    </>
  );
};
