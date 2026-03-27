const { randomBytes } = require('crypto');
const fs = require('fs');

let iconsLibraryCache = null;

function loadIconsLibrary() {
  if (iconsLibraryCache) return iconsLibraryCache;
  try {
    const raw = fs.readFileSync('/Users/robsonoliveira/Downloads/EXCALDRAW/icons.excalidrawlib', 'utf8');
    const data = JSON.parse(raw);
    const items = data.libraryItems || data.library || [];
    iconsLibraryCache = {};
    for (const item of items) {
      if (item.name) {
        iconsLibraryCache[item.name.toLowerCase()] = item.elements || [];
      }
    }
    return iconsLibraryCache;
  } catch (e) {
    return {};
  }
}

function injectLibraryItem(itemName, targetX, targetY, frameId, colorTheme) {
  const lib = loadIconsLibrary();
  const elements = lib[itemName.toLowerCase()];
  if (!elements || elements.length === 0) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.width > maxX) maxX = el.x + el.width;
    if (el.y + el.height > maxY) maxY = el.y + el.height;
  }
  const cx = minX + (maxX - minX) / 2;
  const cy = minY + (maxY - minY) / 2;

  const clones = [];
  const groupId = "group-" + uuid();
  for (const el of elements) {
    const clone = JSON.parse(JSON.stringify(el));
    clone.id = "lib-" + uuid();
    clone.frameId = frameId;
    clone.groupIds = [(el.groupIds || [])[0] || groupId];
    clone.x = targetX + (el.x - cx);
    clone.y = targetY + (el.y - cy);
    if (clone.strokeColor !== "transparent" && clone.strokeColor !== "#ffffff") {
      clone.strokeColor = colorTheme.accent;
    }
    clones.push(clone);
  }
  return clones;
}

function uuid() {
  return randomBytes(8).toString('hex');
}

function getTextDim(text, fontSize) {
  const lines = text.split('\n');
  const maxChars = Math.max(...lines.map(l => l.length));
  return {
    w: Math.max(maxChars * (fontSize * 0.52), 100),
    h: lines.length * (fontSize * 1.35)
  };
}

function baseProps(frameId) {
  return {
    angle: 0,
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2147483647),
    seed: Math.floor(Math.random() * 2147483647),
    frameId: frameId || null,
  };
}

// Texto limpo — sem roughness, fonte Inter (família 3 = sans-serif no Excalidraw)
function createText(x, y, text, fontSize, align = "left", frameId, color = "#FFFFFF", fontFamily = 3) {
  const dim = getTextDim(text, fontSize);
  let finalX = x;
  if (align === "center") finalX = x - dim.w / 2;
  if (align === "right") finalX = x - dim.w;

  return {
    ...baseProps(frameId),
    id: "txt-" + uuid(), type: "text",
    x: finalX, y: y - dim.h / 2,
    width: dim.w, height: dim.h,
    text, originalText: text, autoResize: true,
    fontSize, fontFamily,
    textAlign: align, verticalAlign: "top",
    strokeColor: color, backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
    roughness: 0, opacity: 100,
    roundness: null, containerId: null, lineHeight: 1.35,
  };
}

// Retângulo clean — roughness 0, solid
function createRect(x, y, w, h, bg, frameId, stroke = "transparent", opacity = 100, radius = true) {
  return {
    ...baseProps(frameId),
    id: "rect-" + uuid(), type: "rectangle",
    x, y, width: w, height: h,
    strokeColor: stroke, backgroundColor: bg,
    fillStyle: "solid",
    strokeWidth: 2, roughness: 0, strokeStyle: "solid",
    opacity,
    roundness: radius ? { type: 3 } : null
  };
}

// Linha simples
function createLine(sx, sy, ex, ey, frameId, stroke, width = 3) {
  return {
    ...baseProps(frameId),
    id: "line-" + uuid(), type: "line",
    x: sx, y: sy,
    width: Math.abs(ex - sx), height: Math.abs(ey - sy),
    strokeColor: stroke, backgroundColor: "transparent",
    strokeWidth: width, roughness: 0, strokeStyle: "solid",
    fillStyle: "solid", opacity: 100,
    roundness: null,
    points: [[0, 0], [ex - sx, ey - sy]],
    lastCommittedPoint: null,
  };
}

function generateExcalidrawScene(slides, theme) {
  const elements = [];
  let currentX = 0;

  // Paletas baseadas nas recomendações da skill — alto engajamento
  const palettes = {
    purple: {
      bg:     "#1A1A2E",   // dark navy
      card:   "#16213E",   // card mais escuro
      accent: "#6C5CE7",   // roxo vibrante
      accent2:"#A29BFE",   // roxo claro
      text:   "#FFFFFF",
      muted:  "#A0AEC0",
      num:    "#6C5CE7",
    },
    blue: {
      bg:     "#0F172A",
      card:   "#1E293B",
      accent: "#0984E3",
      accent2:"#60A5FA",
      text:   "#FFFFFF",
      muted:  "#94A3B8",
      num:    "#00CEC9",
    },
    green: {
      bg:     "#0D1B2A",
      card:   "#162032",
      accent: "#00B894",
      accent2:"#55EFC4",
      text:   "#FFFFFF",
      muted:  "#90B4A8",
      num:    "#00B894",
    },
    rose: {
      bg:     "#1A0A0F",
      card:   "#2D1520",
      accent: "#E91E63",
      accent2:"#FF80AB",
      text:   "#FFFFFF",
      muted:  "#C49BAA",
      num:    "#FF4081",
    },
    amber: {
      bg:     "#1A1200",
      card:   "#2D2200",
      accent: "#F59E0B",
      accent2:"#FCD34D",
      text:   "#FFFFFF",
      muted:  "#B8A87A",
      num:    "#F59E0B",
    },
  };

  // Twitter/X theme — sempre usa paleta preta independente da escolha
  const twitterPalette = {
    bg:     "#000000",
    card:   "#16181c",
    accent: "#1d9bf0",
    accent2:"#60c8ff",
    text:   "#e7e9ea",
    muted:  "#71767b",
    border: "#2f3336",
  };

  const isTwitter = slides.length > 0 && slides[0].tweetMode === true;
  const c = isTwitter ? twitterPalette : (palettes[theme] || palettes.purple);
  const SLIDE_W = 1080;
  const SLIDE_H = 1350;
  const PAD = 80;

  // Twitter mode — renderiza cada slide como tweet nativo
  if (isTwitter) {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const frameId = "frame-" + uuid();
      const ox = currentX;
      const tw = twitterPalette;

      // Frame
      elements.push({
        ...baseProps(null),
        id: frameId, type: "frame",
        x: ox, y: 0, width: SLIDE_W, height: SLIDE_H,
        name: `Tweet ${i + 1}`,
        strokeColor: tw.border, backgroundColor: "transparent",
        fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
        roughness: 0, roundness: null, frameId: null,
      });

      // Fundo preto
      elements.push(createRect(ox, 0, SLIDE_W, SLIDE_H, tw.bg, frameId));

      // Linha de thread acima (exceto primeiro)
      if (i > 0) {
        elements.push(createLine(ox + 96, 0, ox + 96, 60, frameId, tw.border, 2));
      }

      // Avatar circle (simulado com rect arredondado)
      elements.push(createRect(ox + 60, 80, 72, 72, tw.accent, frameId, "transparent", 100));
      elements.push(createText(ox + 96, 116, slide.avatar || "🧑‍💻", 36, "center", frameId, tw.text));

      // Nome + handle
      elements.push(createText(ox + 156, 90, slide.name || "Creator", 28, "left", frameId, tw.text, 3));
      elements.push(createText(ox + 156, 128, slide.handle || "@inkstage", 22, "left", frameId, tw.muted, 3));

      // Logo X (canto direito)
      elements.push(createText(ox + SLIDE_W - PAD, 100, "𝕏", 36, "right", frameId, tw.muted));

      // Linha divisória após header
      elements.push(createLine(ox + 60, 175, ox + SLIDE_W - 60, 175, frameId, tw.border, 1));

      // Texto do tweet
      const tweetText = slide.text || "";
      const textLen = tweetText.length;
      const tweetFontSize = textLen < 80 ? 48 : textLen < 160 ? 38 : 30;
      const wrapped = wrapText(tweetText, textLen < 80 ? 28 : textLen < 160 ? 34 : 40);
      elements.push(createText(ox + PAD, 220, wrapped, tweetFontSize, "left", frameId, tw.text, 3));

      // Timestamp + thread counter
      const lineCount = wrapped.split('\n').length;
      const afterTextY = 240 + lineCount * (tweetFontSize * 1.45);
      elements.push(createText(ox + PAD, afterTextY + 20, `10:${String(30 + i).padStart(2,'0')} AM · Mar 2025  ·  ${i+1}/${slides.length} da thread`, 20, "left", frameId, tw.muted, 3));

      // Divisor métricas
      const metaY = afterTextY + 70;
      elements.push(createLine(ox + 60, metaY, ox + SLIDE_W - 60, metaY, frameId, tw.border, 1));

      // Métricas
      const metricsY = metaY + 36;
      elements.push(createText(ox + PAD,      metricsY, `💬 ${slide.replies || '0'}`,   24, "left",  frameId, tw.muted, 3));
      elements.push(createText(ox + PAD + 200, metricsY, `🔁 ${slide.retweets || '0'}`, 24, "left",  frameId, tw.muted, 3));
      elements.push(createText(ox + PAD + 400, metricsY, `❤️ ${slide.likes || '0'}`,    24, "left",  frameId, tw.muted, 3));
      elements.push(createText(ox + SLIDE_W - PAD, metricsY, `🔖 ${slide.bookmarks || '0'}`, 24, "right", frameId, tw.muted, 3));

      // Linha de thread abaixo (exceto último)
      if (i < slides.length - 1) {
        elements.push(createLine(ox + 96, SLIDE_H - 60, ox + 96, SLIDE_H, frameId, tw.border, 2));
      }

      // Rodapé
      elements.push(createText(ox + PAD, SLIDE_H - 50, `Thread por ${slide.handle || '@inkstage'}`, 18, "left", frameId, tw.muted + "88", 3));
      elements.push(createText(ox + SLIDE_W - PAD, SLIDE_H - 50, `${i + 1} / ${slides.length}`, 18, "right", frameId, tw.muted, 3));

      currentX += SLIDE_W + 120;
    }

    return {
      type: "excalidraw", version: 2,
      source: "https://carousel-ai.local",
      elements,
      appState: { viewBackgroundColor: "#0a0a0a" },
      files: {}
    };
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const frameId = "frame-" + uuid();
    const ox = currentX; // offset x do frame atual

    // Frame
    elements.push({
      ...baseProps(null),
      id: frameId, type: "frame",
      x: ox, y: 0, width: SLIDE_W, height: SLIDE_H,
      name: `Slide ${i + 1}`,
      strokeColor: "#334155", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
      roughness: 0, roundness: null, frameId: null,
    });

    // Fundo sólido dark
    elements.push(createRect(ox, 0, SLIDE_W, SLIDE_H, c.bg, frameId));

    // Número fantasma de fundo (decorativo, baixa opacidade)
    if (slide.type !== "cover") {
      elements.push({
        ...createText(ox + SLIDE_W - PAD, 20, `${String(i + 1).padStart(2, '0')}`, 200, "right", frameId, c.accent, 3),
        opacity: 8,
      });
    }

    // ─── CAPA ───────────────────────────────────────────────
    if (slide.type === "cover") {

      // Barra de accent no topo
      elements.push(createRect(ox + PAD, 100, 80, 8, c.accent, frameId));

      // Tag/categoria (se houver)
      if (slide.tag) {
        elements.push(createRect(ox + PAD, 120, slide.tag.length * 14 + 32, 44, c.accent + "33", frameId, c.accent, 100));
        elements.push(createText(ox + PAD + 16, 142, slide.tag.toUpperCase(), 18, "left", frameId, c.accent2));
      }

      // Emoji grande
      if (slide.emoji) {
        elements.push(createText(ox + PAD, 200, slide.emoji, 90, "left", frameId));
      }

      // Título principal — grande, impactante
      const titleY = slide.emoji ? 340 : 260;
      const titleLines = wrapText(slide.title, 22);
      elements.push(createText(ox + PAD, titleY, titleLines, 66, "left", frameId, c.text, 3));

      // Subtítulo
      if (slide.subtitle) {
        const subY = titleY + titleLines.split('\n').length * 90 + 32;
        elements.push(createText(ox + PAD, subY, slide.subtitle, 30, "left", frameId, c.muted, 3));
      }

      // Linha divisória + "Deslize →"
      elements.push(createLine(ox + PAD, SLIDE_H - 160, ox + SLIDE_W - PAD, SLIDE_H - 160, frameId, c.accent + "44", 1));
      elements.push(createText(ox + PAD, SLIDE_H - 130, "Deslize para ver →", 24, "left", frameId, c.muted, 3));

      // Handle
      elements.push(createText(ox + SLIDE_W - PAD, SLIDE_H - 130, slide.handle || "@inkstage", 22, "right", frameId, c.accent2, 3));

    // ─── MIND MAP ────────────────────────────────────────────
    } else if (slide.type === "mindmap") {

      // Título do slide
      elements.push(createText(ox + PAD, 80, slide.title || "Mind Map", 36, "left", frameId, c.accent2, 3));
      elements.push(createLine(ox + PAD, 140, ox + PAD + 300, 140, frameId, c.accent, 3));

      // Root node — centralizado, destaque
      const rootW = 440, rootH = 100;
      const rootX = ox + SLIDE_W / 2 - rootW / 2;
      const rootY = 240;
      elements.push(createRect(rootX, rootY, rootW, rootH, c.accent, frameId, "transparent", 100));
      elements.push(createText(ox + SLIDE_W / 2, rootY + rootH / 2, slide.root || slide.title, 36, "center", frameId, "#FFFFFF", 3));

      // Branches
      const branches = slide.branches || [];
      const branchH = 72, branchW = 300;
      const startY = 440, gapY = 130;

      for (let b = 0; b < branches.length; b++) {
        const isLeft = b % 2 === 0;
        const bX = isLeft ? ox + 60 : ox + SLIDE_W - 60 - branchW;
        const bY = startY + Math.floor(b / 2) * gapY;

        // Seta do root para o branch
        const asx = isLeft ? rootX : rootX + rootW;
        const asy = rootY + rootH / 2;
        const aex = isLeft ? bX + branchW : bX;
        const aey = bY + branchH / 2;
        elements.push(createLine(asx, asy, aex, aey, frameId, c.accent + "66", 2));

        // Card do branch
        elements.push(createRect(bX, bY, branchW, branchH, c.card, frameId, c.accent + "55", 100));
        elements.push(createText(bX + branchW / 2, bY + branchH / 2, branches[b], 26, "center", frameId, c.text, 3));
      }

    // ─── CTA ─────────────────────────────────────────────────
    } else if (slide.type === "cta") {

      // Fundo accent suave
      elements.push(createRect(ox + PAD, 200, SLIDE_W - PAD * 2, 500, c.accent + "15", frameId, c.accent + "33", 100));

      // Título CTA
      const ctaLines = wrapText(slide.title || "Gostou do conteúdo?", 20);
      elements.push(createText(ox + SLIDE_W / 2, 340, ctaLines, 60, "center", frameId, c.text, 3));

      // Handle
      elements.push(createText(ox + SLIDE_W / 2, 560, slide.handle || "@inkstage", 40, "center", frameId, c.accent, 3));

      // Botão pill
      const btnW = 520, btnH = 90;
      const btnX = ox + SLIDE_W / 2 - btnW / 2;
      elements.push(createRect(btnX, 680, btnW, btnH, c.accent, frameId, "transparent", 100));
      elements.push(createText(ox + SLIDE_W / 2, 725, slide.action || "Salva e compartilha! 🔖", 28, "center", frameId, "#FFFFFF", 3));

      // Linha sutil
      elements.push(createLine(ox + PAD, SLIDE_H - 160, ox + SLIDE_W - PAD, SLIDE_H - 160, frameId, c.accent + "33", 1));
      elements.push(createText(ox + SLIDE_W / 2, SLIDE_H - 130, "Siga para mais conteúdo →", 22, "center", frameId, c.muted, 3));

    // ─── CONTEÚDO (Lista / Tips / Steps) ────────────────────
    } else {

      // Título do slide
      const titleLines = wrapText(slide.title, 24);
      elements.push(createText(ox + PAD, 80, titleLines, 48, "left", frameId, c.text, 3));

      // Linha de destaque abaixo do título
      const titleLineCount = titleLines.split('\n').length;
      const lineY = 80 + titleLineCount * 65;
      elements.push(createLine(ox + PAD, lineY, ox + PAD + 120, lineY, frameId, c.accent, 4));

      const items = slide.items || [];
      let currY = lineY + 50;
      const itemH = items.length <= 3 ? 240 : items.length === 4 ? 200 : 160;
      const itemGap = 20;

      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const cardX = ox + PAD;
        const cardW = SLIDE_W - PAD * 2;

        // Card com borda accent
        elements.push(createRect(cardX, currY, cardW, itemH, c.card, frameId, c.accent + "44", 100));

        // Barra de accent lateral
        elements.push(createRect(cardX, currY, 6, itemH, c.accent, frameId, "transparent", 100, false));

        // Número do item — grande, decorativo
        const numStr = String(j + 1).padStart(2, '0');
        elements.push({
          ...createText(cardX + cardW - 20, currY + 10, numStr, 72, "right", frameId, c.accent, 3),
          opacity: 15,
        });

        // Ícone ou emoji
        const iconY = currY + itemH / 2 - 20;
        if (it.iconName && it.iconName !== "none") {
          const iconEls = injectLibraryItem(it.iconName, cardX + 56, currY + itemH / 2, frameId, c);
          if (iconEls.length > 0) {
            elements.push(...iconEls);
          } else {
            elements.push(createText(cardX + 24, iconY, it.icon || "→", 44, "left", frameId, c.accent));
          }
        } else {
          elements.push(createText(cardX + 24, iconY, it.icon || "→", 44, "left", frameId, c.accent));
        }

        // Título do item
        const itemTitleY = currY + (itemH <= 160 ? 28 : 40);
        elements.push(createText(cardX + 90, itemTitleY, it.title, itemH <= 160 ? 28 : 32, "left", frameId, c.text, 3));

        // Descrição
        if (it.description && itemH > 130) {
          const descLines = wrapText(it.description, 40);
          const descY = itemTitleY + (itemH <= 160 ? 44 : 54);
          elements.push(createText(cardX + 90, descY, descLines, 22, "left", frameId, c.muted, 3));
        }

        currY += itemH + itemGap;
      }
    }

    // Rodapé — handle + número da página em todos os slides
    elements.push(createText(ox + PAD, SLIDE_H - 60, slide.handle || "@inkstage", 20, "left", frameId, c.accent + "99", 3));
    elements.push(createText(ox + SLIDE_W - PAD, SLIDE_H - 60, `${i + 1} / ${slides.length}`, 20, "right", frameId, c.muted, 3));

    currentX += SLIDE_W + 120;
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "https://carousel-ai.local",
    elements,
    appState: { viewBackgroundColor: "#0F0F1A" },
    files: {}
  };
}

// Quebra texto em múltiplas linhas
function wrapText(text, maxCharsPerLine) {
  if (!text) return "";
  if (text.length <= maxCharsPerLine) return text;

  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.join('\n');
}

module.exports = { generateExcalidrawScene };
