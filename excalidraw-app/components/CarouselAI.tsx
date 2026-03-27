import { useState, useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { syncInvalidIndices } from "@excalidraw/element";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const AI_BACKEND = import.meta.env.VITE_APP_AI_BACKEND || "http://localhost:3016";

// ════════════════════════════════════════════════════════════════
// CarouselAI — Generates Instagram Carousel natively on Canvas
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

      // 1. Restore elements (fills in missing fields, generates valid structure)
      const restoredElements = restoreElements(rawElements, null, {
        repairBindings: true,
      });

      // 2. Merge with existing scene elements
      const allElements = [
        ...excalidrawAPI.getSceneElementsIncludingDeleted(),
        ...restoredElements,
      ];

      // 3. Fix all fractional indices for the merged array
      const orderedElements = syncInvalidIndices(allElements);

      // 4. Update scene with properly ordered elements
      excalidrawAPI.updateScene({
        elements: orderedElements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      // Scroll to the new content
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
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Gerar Carrossel com IA"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "48px",
          height: "48px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
          border: "none",
          color: "#fff",
          fontSize: "22px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(139,92,246,0.4)",
          zIndex: 1000,
          transition: "transform 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        🎠
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            right: "24px",
            width: "320px",
            background: "#1a1a2e",
            borderRadius: "16px",
            border: "1px solid #3f3f46",
            padding: "20px",
            zIndex: 1001,
            boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
            fontFamily: "'Inter', system-ui, sans-serif",
            color: "#fafafa",
          }}
        >
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
              onClick={() => setIsOpen(false)}
              style={{ background: "none", border: "none", color: "#71717a", fontSize: "18px", cursor: "pointer" }}
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
              fontSize: "13px",
              fontFamily: "inherit",
              marginTop: "6px",
              marginBottom: "12px",
              resize: "vertical",
              minHeight: "60px",
            }}
          />

          {/* Format */}
          <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa", letterSpacing: "0.06em" }}>Formato</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "6px", marginBottom: "12px" }}>
            {formats.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                style={{
                  gridColumn: (f as any).fullWidth ? "span 2" : undefined,
                  background: format === f.id
                    ? f.id === "twitter" ? "rgba(29,155,240,0.15)" : "rgba(139,92,246,0.15)"
                    : "#27272a",
                  border: `1.5px solid ${format === f.id
                    ? f.id === "twitter" ? "#1d9bf0" : "#8b5cf6"
                    : "#3f3f46"}`,
                  borderRadius: "8px",
                  padding: "8px",
                  color: format === f.id
                    ? f.id === "twitter" ? "#60c8ff" : "#c4b5fd"
                    : "#a1a1aa",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Color + Count */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa", letterSpacing: "0.06em" }}>Cor</label>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                {colors.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setColor(c.id)}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: c.bg,
                      border: `2px solid ${color === c.id ? "#fff" : "transparent"}`,
                      cursor: "pointer",
                      transform: color === c.id ? "scale(1.1)" : "scale(1)",
                      transition: "all 0.12s",
                    }}
                  />
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
                  padding: "5px 8px",
                  color: "#fafafa",
                  fontSize: "12px",
                  fontFamily: "inherit",
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
            onClick={generate}
            disabled={isLoading || !topic.trim()}
            style={{
              width: "100%",
              padding: "12px",
              background: isLoading ? "#4c1d95" : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 700,
              cursor: isLoading ? "wait" : "pointer",
              opacity: (!topic.trim()) ? 0.4 : 1,
              fontFamily: "inherit",
            }}
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
