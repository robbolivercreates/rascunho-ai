/**
 * Excalidraw Wireframe Renderer
 *
 * Converts a structured wireframe spec (JSON from AI) into native
 * Excalidraw elements. Produces lo-fi, professional wireframes in the
 * Balsamiq/Figma style — clean grayscale, real UI components.
 *
 * Wireframe spec shape:
 * {
 *   screens: [
 *     {
 *       name: "Home",
 *       type: "mobile" | "desktop" | "tablet",
 *       components: [
 *         { kind: "header", title: "AppName", hasBack: false, hasMenu: true },
 *         { kind: "search", placeholder: "Buscar..." },
 *         { kind: "hero", title: "Bem-vindo!", subtitle: "Tagline aqui", hasButton: true, buttonLabel: "Começar" },
 *         { kind: "section_title", text: "Em destaque" },
 *         { kind: "card_row", cards: [{ title: "...", subtitle: "..." }] },
 *         { kind: "card_list", items: [{ title: "...", meta: "..." }] },
 *         { kind: "tabs", labels: ["Feed", "Explorar", "Perfil"] },
 *         { kind: "button", label: "Fazer login", style: "primary" | "outline" | "ghost" },
 *         { kind: "input", label: "E-mail", placeholder: "..." },
 *         { kind: "nav_bar", items: ["Home", "Buscar", "Favoritos", "Perfil"] },
 *         { kind: "text_block", text: "...", size: "h1"|"h2"|"body"|"caption" },
 *         { kind: "image_placeholder", caption: "Foto do produto", aspectRatio: "16:9"|"1:1"|"4:3" },
 *         { kind: "divider" },
 *         { kind: "badge", text: "Novo", color: "accent" },
 *         { kind: "avatar_row", users: ["Ana", "Bob", "Carol"] },
 *         { kind: "stat_row", stats: [{ label: "Vendas", value: "1.2k" }] },
 *         { kind: "form", fields: [{ label: "Nome" }, { label: "E-mail" }], submitLabel: "Enviar" },
 *         { kind: "modal", title: "Confirmar?", body: "...", actions: ["Cancelar", "Confirmar"] },
 *         { kind: "list_item", title: "...", meta: "...", hasArrow: true, hasIcon: true },
 *       ],
 *       flows: [
 *         { to: "Tela: Detalhe", label: "tap card" }
 *       ]
 *     }
 *   ]
 * }
 */

const { randomBytes } = require("crypto");

// ─── Helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return randomBytes(6).toString("hex");
}

function baseProps(frameId = null) {
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
    frameId,
  };
}

// Wireframe color tokens — strict grayscale + 1 accent
const WF = {
  bg: "#FFFFFF",          // screen background
  surface: "#F4F4F5",     // card / input background
  surface2: "#E4E4E7",    // secondary surface, dividers
  border: "#D4D4D8",      // border color
  borderDark: "#A1A1AA",  // stronger border
  textPrimary: "#18181B", // main text
  textSecondary: "#71717A", // muted text
  textDisabled: "#A1A1AA",
  accent: "#6C5CE7",      // single accent (purple — matches Carousel AI branding)
  accentLight: "#EDE9FE", // accent light bg
  white: "#FFFFFF",
  black: "#18181B",
  placeholder: "#D4D4D8", // image placeholder fill
  shadow: "#0000001A",    // not directly usable, used as hint
};

// Font families in Excalidraw numeric format
const FONT = {
  sketch: 1,   // Virgil — hand-drawn, good for lo-fi wireframes
  sans: 2,     // Helvetica — clean, professional
  mono: 3,     // Cascadia — code/labels
  display: 6,  // Nunito — friendly, rounded
};

// Use "sketch" roughness for lo-fi, 0 for clean
const ROUGHNESS = { clean: 0, sketch: 1 };

function createRect(x, y, w, h, {
  bg = WF.surface,
  stroke = WF.border,
  strokeWidth = 1,
  roughness = ROUGHNESS.clean,
  rounded = false,
  opacity = 100,
  frameId = null,
  strokeStyle = "solid",
  fillStyle = "solid",
} = {}) {
  return {
    ...baseProps(frameId),
    id: "r-" + uuid(),
    type: "rectangle",
    x, y, width: w, height: h,
    backgroundColor: bg,
    strokeColor: stroke,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    roundness: rounded ? { type: 3 } : null,
  };
}

function createEllipse(x, y, w, h, {
  bg = WF.surface,
  stroke = WF.border,
  strokeWidth = 1,
  roughness = ROUGHNESS.clean,
  opacity = 100,
  frameId = null,
} = {}) {
  return {
    ...baseProps(frameId),
    id: "e-" + uuid(),
    type: "ellipse",
    x, y, width: w, height: h,
    backgroundColor: bg,
    strokeColor: stroke,
    fillStyle: "solid",
    strokeWidth,
    roughness,
    opacity,
    roundness: { type: 2 },
  };
}

function createText(x, y, text, fontSize = 14, {
  align = "left",
  color = WF.textPrimary,
  font = FONT.sans,
  frameId = null,
  bold = false,
  opacity = 100,
} = {}) {
  const chars = Math.max(...text.split("\n").map((l) => l.length));
  const w = Math.max(chars * fontSize * 0.55, 40);
  const lines = text.split("\n").length;
  const h = lines * fontSize * 1.4;

  let finalX = x;
  if (align === "center") finalX = x - w / 2;
  if (align === "right") finalX = x - w;

  return {
    ...baseProps(frameId),
    id: "t-" + uuid(),
    type: "text",
    x: finalX, y: y - h / 2,
    width: w, height: h,
    text,
    originalText: text,
    autoResize: true,
    fontSize,
    fontFamily: font,
    fontWeight: bold ? 700 : 400,
    textAlign: align,
    verticalAlign: "top",
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity,
    roundness: null,
    containerId: null,
    lineHeight: 1.4,
  };
}

function createLine(x1, y1, x2, y2, {
  stroke = WF.border,
  strokeWidth = 1,
  strokeStyle = "solid",
  frameId = null,
  roughness = ROUGHNESS.clean,
} = {}) {
  return {
    ...baseProps(frameId),
    id: "l-" + uuid(),
    type: "line",
    x: x1, y: y1,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    points: [[0, 0], [x2 - x1, y2 - y1]],
    lastCommittedPoint: null,
    strokeColor: stroke,
    backgroundColor: "transparent",
    strokeWidth,
    strokeStyle,
    roughness,
    fillStyle: "solid",
    opacity: 100,
    roundness: null,
  };
}

function createArrow(x1, y1, x2, y2, label = "", {
  stroke = WF.borderDark,
  frameId = null,
  elbowed = true,
} = {}) {
  const elements = [];
  const arrowId = "arr-" + uuid();

  elements.push({
    ...baseProps(frameId),
    id: arrowId,
    type: "arrow",
    x: x1, y: y1,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    points: [[0, 0], [x2 - x1, y2 - y1]],
    lastCommittedPoint: null,
    strokeColor: stroke,
    backgroundColor: "transparent",
    strokeWidth: 1.5,
    strokeStyle: "solid",
    roughness: ROUGHNESS.clean,
    fillStyle: "solid",
    opacity: 100,
    roundness: { type: 2 },
    startArrowhead: null,
    endArrowhead: "arrow",
    startBinding: null,
    endBinding: null,
    elbowed,
  });

  if (label) {
    elements.push(
      createText(
        x1 + (x2 - x1) / 2,
        y1 + (y2 - y1) / 2,
        label,
        11,
        { align: "center", color: WF.textSecondary, font: FONT.sans, frameId }
      )
    );
  }

  return elements;
}

// ─── Component Renderers ─────────────────────────────────────────────────────
// Each renderer receives (ox, oy, w, opts, frameId) and returns { elements, height }
// ox/oy = top-left origin, w = available width

function renderHeader(ox, oy, w, opts, frameId) {
  const H = 56;
  const elements = [];

  // Background bar
  elements.push(createRect(ox, oy, w, H, { bg: WF.white, stroke: WF.border, strokeWidth: 1, frameId }));

  // Back arrow (if hasBack)
  if (opts.hasBack) {
    elements.push(createText(ox + 16, oy + H / 2, "←", 18, { color: WF.accent, frameId }));
  }

  // Title centered
  const titleX = opts.hasBack ? ox + w / 2 : ox + 16;
  const titleAlign = opts.hasBack ? "center" : "left";
  elements.push(
    createText(titleX, oy + H / 2, opts.title || "AppName", 15, {
      align: titleAlign, color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
    })
  );

  // Hamburger menu icon (if hasMenu)
  if (opts.hasMenu) {
    const mx = ox + w - 40;
    const my = oy + H / 2 - 8;
    for (let i = 0; i < 3; i++) {
      elements.push(createLine(mx, my + i * 6, mx + 20, my + i * 6, { stroke: WF.textPrimary, strokeWidth: 1.5, frameId }));
    }
  }

  // Divider at bottom
  elements.push(createLine(ox, oy + H, ox + w, oy + H, { stroke: WF.border, frameId }));

  return { elements, height: H };
}

function renderSearch(ox, oy, w, opts, frameId) {
  const H = 44;
  const pad = 16;
  const elements = [];

  // Search box
  elements.push(createRect(ox + pad, oy + 8, w - pad * 2, H, {
    bg: WF.surface, stroke: WF.border, rounded: true, frameId,
  }));

  // Search icon (🔍 simulated with circle + line)
  elements.push(createEllipse(ox + pad + 12, oy + 16, 18, 18, { bg: "transparent", stroke: WF.textDisabled, strokeWidth: 1.5, frameId }));
  elements.push(createLine(ox + pad + 28, oy + 32, ox + pad + 34, oy + 38, { stroke: WF.textDisabled, strokeWidth: 1.5, frameId }));

  // Placeholder
  elements.push(
    createText(ox + pad + 40, oy + 28, opts.placeholder || "Buscar...", 13, {
      color: WF.textDisabled, font: FONT.sans, frameId,
    })
  );

  return { elements, height: H + 16 };
}

function renderHero(ox, oy, w, opts, frameId) {
  const PAD = 24;
  let currY = oy + 32;
  const elements = [];

  // Hero title
  elements.push(
    createText(ox + PAD, currY, opts.title || "Título Principal", 26, {
      color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
    })
  );
  currY += 44;

  // Subtitle
  if (opts.subtitle) {
    elements.push(
      createText(ox + PAD, currY, opts.subtitle, 14, {
        color: WF.textSecondary, font: FONT.sans, frameId,
      })
    );
    currY += 28;
  }

  // CTA Button
  if (opts.hasButton) {
    const btnW = Math.min(200, w - PAD * 2);
    elements.push(
      createRect(ox + PAD, currY + 8, btnW, 40, {
        bg: WF.accent, stroke: "transparent", rounded: true, frameId,
      })
    );
    elements.push(
      createText(ox + PAD + btnW / 2, currY + 28, opts.buttonLabel || "Começar", 13, {
        align: "center", color: WF.white, font: FONT.sans, bold: true, frameId,
      })
    );
    currY += 60;
  }

  return { elements, height: currY - oy + 16 };
}

function renderSectionTitle(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const elements = [];

  elements.push(
    createText(ox + PAD, oy + 20, opts.text || "Seção", 15, {
      color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
    })
  );

  // "Ver tudo" link on the right
  if (opts.hasLink) {
    elements.push(
      createText(ox + w - PAD, oy + 20, "Ver tudo →", 12, {
        align: "right", color: WF.accent, font: FONT.sans, frameId,
      })
    );
  }

  return { elements, height: 44 };
}

function renderCardRow(ox, oy, w, opts, frameId) {
  const cards = opts.cards || [{ title: "Card" }];
  const PAD = 16;
  const GAP = 12;
  const cardCount = Math.min(cards.length, 3);
  const cardW = (w - PAD * 2 - GAP * (cardCount - 1)) / cardCount;
  const CARD_H = opts.cardHeight || 140;
  const elements = [];

  for (let i = 0; i < cardCount; i++) {
    const card = cards[i];
    const cx = ox + PAD + i * (cardW + GAP);
    const cy = oy + 8;

    // Card container
    elements.push(createRect(cx, cy, cardW, CARD_H, {
      bg: WF.white, stroke: WF.border, rounded: true, strokeWidth: 1, frameId,
    }));

    // Image placeholder area (top 55% of card)
    const imgH = Math.floor(CARD_H * 0.55);
    elements.push(createRect(cx, cy, cardW, imgH, {
      bg: WF.surface, stroke: "transparent", rounded: false, frameId,
      fillStyle: "hachure",
    }));

    // Title
    elements.push(
      createText(cx + 10, cy + imgH + 16, card.title || "Título", 13, {
        color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
      })
    );

    // Subtitle
    if (card.subtitle) {
      elements.push(
        createText(cx + 10, cy + imgH + 34, card.subtitle, 11, {
          color: WF.textSecondary, font: FONT.sans, frameId,
        })
      );
    }
  }

  return { elements, height: CARD_H + 24 };
}

function renderCardList(ox, oy, w, opts, frameId) {
  const items = opts.items || [];
  const PAD = 16;
  const ITEM_H = 72;
  const GAP = 8;
  const elements = [];
  let currY = oy + 8;

  for (const item of items) {
    // Row container
    elements.push(createRect(ox + PAD, currY, w - PAD * 2, ITEM_H, {
      bg: WF.white, stroke: WF.border, rounded: true, frameId,
    }));

    // Thumbnail placeholder
    elements.push(createRect(ox + PAD + 10, currY + 10, 52, 52, {
      bg: WF.surface, stroke: WF.border, rounded: true, frameId,
    }));

    // Title
    elements.push(
      createText(ox + PAD + 74, currY + 22, item.title || "Item", 13, {
        color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
      })
    );

    // Meta
    if (item.meta) {
      elements.push(
        createText(ox + PAD + 74, currY + 42, item.meta, 11, {
          color: WF.textSecondary, font: FONT.sans, frameId,
        })
      );
    }

    // Chevron
    if (item.hasArrow !== false) {
      elements.push(
        createText(ox + w - PAD - 24, currY + ITEM_H / 2, "›", 20, {
          color: WF.textDisabled, frameId,
        })
      );
    }

    currY += ITEM_H + GAP;
  }

  return { elements, height: currY - oy + 8 };
}

function renderTabs(ox, oy, w, opts, frameId) {
  const labels = opts.labels || ["Tab 1", "Tab 2", "Tab 3"];
  const H = 44;
  const tabW = w / labels.length;
  const elements = [];

  // Background
  elements.push(createRect(ox, oy, w, H, { bg: WF.surface2, stroke: "transparent", frameId }));

  for (let i = 0; i < labels.length; i++) {
    const tx = ox + i * tabW;
    const isActive = opts.activeTab === i || (opts.activeTab === undefined && i === 0);

    if (isActive) {
      elements.push(createRect(tx, oy, tabW, H, { bg: WF.white, stroke: WF.border, frameId }));
      elements.push(createLine(tx, oy + H - 2, tx + tabW, oy + H - 2, { stroke: WF.accent, strokeWidth: 2, frameId }));
    }

    elements.push(
      createText(tx + tabW / 2, oy + H / 2, labels[i], 13, {
        align: "center",
        color: isActive ? WF.accent : WF.textSecondary,
        font: FONT.sans,
        bold: isActive,
        frameId,
      })
    );
  }

  return { elements, height: H };
}

function renderButton(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const BTN_H = 44;
  const btnW = opts.fullWidth ? w - PAD * 2 : Math.min(w - PAD * 2, 200);
  const btnX = opts.align === "center" ? ox + (w - btnW) / 2 : ox + PAD;
  const elements = [];

  let bg, stroke, textColor;
  switch (opts.style) {
    case "outline":
      bg = "transparent"; stroke = WF.accent; textColor = WF.accent; break;
    case "ghost":
      bg = "transparent"; stroke = "transparent"; textColor = WF.textPrimary; break;
    case "danger":
      bg = "#FEE2E2"; stroke = "#FCA5A5"; textColor = "#DC2626"; break;
    default: // primary
      bg = WF.accent; stroke = "transparent"; textColor = WF.white;
  }

  elements.push(
    createRect(btnX, oy + 8, btnW, BTN_H, {
      bg, stroke, strokeWidth: opts.style === "outline" ? 1.5 : 1,
      rounded: true, frameId,
    })
  );
  elements.push(
    createText(btnX + btnW / 2, oy + 8 + BTN_H / 2, opts.label || "Button", 14, {
      align: "center", color: textColor, font: FONT.sans, bold: true, frameId,
    })
  );

  return { elements, height: BTN_H + 20 };
}

function renderInput(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const INPUT_H = 44;
  const elements = [];
  let currY = oy + 4;

  // Label
  if (opts.label) {
    elements.push(
      createText(ox + PAD, currY + 8, opts.label, 12, {
        color: WF.textSecondary, font: FONT.sans, bold: true, frameId,
      })
    );
    currY += 24;
  }

  // Input box
  elements.push(createRect(ox + PAD, currY, w - PAD * 2, INPUT_H, {
    bg: WF.white, stroke: WF.border, rounded: true, frameId,
  }));

  // Placeholder text
  elements.push(
    createText(ox + PAD + 14, currY + INPUT_H / 2, opts.placeholder || "Digite aqui...", 13, {
      color: WF.textDisabled, font: FONT.sans, frameId,
    })
  );

  return { elements, height: INPUT_H + (opts.label ? 36 : 12) };
}

function renderNavBar(ox, oy, w, opts, frameId) {
  const items = opts.items || ["Home", "Buscar", "Perfil"];
  const H = 60;
  const itemW = w / items.length;
  const elements = [];

  // Background + top border
  elements.push(createRect(ox, oy, w, H, { bg: WF.white, stroke: WF.border, frameId }));
  elements.push(createLine(ox, oy, ox + w, oy, { stroke: WF.border, frameId }));

  for (let i = 0; i < items.length; i++) {
    const ix = ox + i * itemW;
    const isActive = opts.activeItem === i || (opts.activeItem === undefined && i === 0);

    // Icon placeholder (small circle)
    elements.push(createEllipse(ix + itemW / 2 - 10, oy + 8, 20, 20, {
      bg: isActive ? WF.accentLight : WF.surface,
      stroke: isActive ? WF.accent : WF.border,
      strokeWidth: 1,
      frameId,
    }));

    // Label
    elements.push(
      createText(ix + itemW / 2, oy + 36, items[i], 11, {
        align: "center",
        color: isActive ? WF.accent : WF.textSecondary,
        font: FONT.sans,
        bold: isActive,
        frameId,
      })
    );
  }

  return { elements, height: H };
}

function renderTextBlock(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const sizeMap = { h1: 28, h2: 20, h3: 16, body: 13, caption: 11 };
  const fontSize = sizeMap[opts.size] || 13;
  const bold = ["h1", "h2", "h3"].includes(opts.size);
  const color = opts.size === "caption" ? WF.textSecondary : WF.textPrimary;
  const elements = [];

  elements.push(
    createText(ox + PAD, oy + 12, opts.text || "Texto aqui", fontSize, {
      color, font: FONT.sans, bold, frameId,
    })
  );

  return { elements, height: fontSize * 1.6 + 20 };
}

function renderImagePlaceholder(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const ratioMap = { "16:9": 9 / 16, "4:3": 3 / 4, "1:1": 1, "9:16": 16 / 9, "3:4": 4 / 3 };
  const ratio = ratioMap[opts.aspectRatio] || 9 / 16;
  const imgW = w - PAD * 2;
  const imgH = Math.round(imgW * ratio);
  const elements = [];

  // Placeholder box with hachure fill
  elements.push(createRect(ox + PAD, oy + 8, imgW, imgH, {
    bg: WF.surface, stroke: WF.border, rounded: false,
    fillStyle: "hachure", frameId,
  }));

  // Cross lines to indicate "image"
  elements.push(createLine(ox + PAD, oy + 8, ox + PAD + imgW, oy + 8 + imgH, {
    stroke: WF.border, strokeWidth: 1, frameId,
  }));
  elements.push(createLine(ox + PAD + imgW, oy + 8, ox + PAD, oy + 8 + imgH, {
    stroke: WF.border, strokeWidth: 1, frameId,
  }));

  // Caption
  if (opts.caption) {
    elements.push(
      createText(ox + PAD + imgW / 2, oy + 8 + imgH + 14, opts.caption, 11, {
        align: "center", color: WF.textSecondary, font: FONT.sans, frameId,
      })
    );
  }

  return { elements, height: imgH + 24 + (opts.caption ? 20 : 0) };
}

function renderDivider(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const elements = [];

  elements.push(createLine(ox + PAD, oy + 12, ox + w - PAD, oy + 12, {
    stroke: WF.surface2, strokeWidth: 1, frameId,
  }));

  return { elements, height: 24 };
}

function renderAvatarRow(ox, oy, w, opts, frameId) {
  const users = opts.users || [];
  const PAD = 16;
  const SIZE = 36;
  const OVERLAP = 12;
  const elements = [];

  for (let i = 0; i < Math.min(users.length, 5); i++) {
    const ax = ox + PAD + i * (SIZE - OVERLAP);
    elements.push(createEllipse(ax, oy + 8, SIZE, SIZE, {
      bg: WF.surface2, stroke: WF.white, strokeWidth: 2, frameId,
    }));
    // Initial
    const initial = (users[i] || "?")[0].toUpperCase();
    elements.push(createText(ax + SIZE / 2, oy + 8 + SIZE / 2, initial, 12, {
      align: "center", color: WF.textSecondary, font: FONT.sans, bold: true, frameId,
    }));
  }

  if (opts.label) {
    const labelX = ox + PAD + Math.min(users.length, 5) * (SIZE - OVERLAP) + 8;
    elements.push(createText(labelX, oy + 8 + SIZE / 2, opts.label, 12, {
      color: WF.textSecondary, font: FONT.sans, frameId,
    }));
  }

  return { elements, height: SIZE + 20 };
}

function renderStatRow(ox, oy, w, opts, frameId) {
  const stats = opts.stats || [];
  const PAD = 16;
  const statW = (w - PAD * 2) / Math.max(stats.length, 1);
  const elements = [];

  // Container
  elements.push(createRect(ox + PAD, oy + 8, w - PAD * 2, 72, {
    bg: WF.surface, stroke: WF.border, rounded: true, frameId,
  }));

  for (let i = 0; i < stats.length; i++) {
    const sx = ox + PAD + i * statW;
    const stat = stats[i];

    // Value
    elements.push(createText(sx + statW / 2, oy + 22, stat.value || "0", 20, {
      align: "center", color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
    }));

    // Label
    elements.push(createText(sx + statW / 2, oy + 52, stat.label || "", 11, {
      align: "center", color: WF.textSecondary, font: FONT.sans, frameId,
    }));

    // Vertical divider (not after last)
    if (i < stats.length - 1) {
      elements.push(createLine(sx + statW, oy + 16, sx + statW, oy + 72, {
        stroke: WF.border, strokeWidth: 1, frameId,
      }));
    }
  }

  return { elements, height: 92 };
}

function renderForm(ox, oy, w, opts, frameId) {
  const fields = opts.fields || [];
  const elements = [];
  let currY = oy;

  for (const field of fields) {
    const rendered = renderInput(ox, currY, w, field, frameId);
    elements.push(...rendered.elements);
    currY += rendered.height + 4;
  }

  // Submit button
  const submitRendered = renderButton(ox, currY, w, {
    label: opts.submitLabel || "Enviar",
    style: "primary",
    fullWidth: true,
  }, frameId);
  elements.push(...submitRendered.elements);
  currY += submitRendered.height;

  return { elements, height: currY - oy };
}

function renderModal(ox, oy, w, opts, frameId) {
  const PAD = 24;
  const MODAL_W = w * 0.85;
  const mx = ox + (w - MODAL_W) / 2;
  const elements = [];
  let currY = oy + 20;

  // Backdrop (semi-transparent overlay hint)
  elements.push(createRect(ox, oy, w, 280, {
    bg: "#00000014", stroke: "transparent", frameId, opacity: 60,
  }));

  // Modal card
  elements.push(createRect(mx, currY, MODAL_W, 220, {
    bg: WF.white, stroke: WF.border, rounded: true, strokeWidth: 1, frameId,
  }));

  // Title
  elements.push(createText(mx + PAD, currY + 24, opts.title || "Título", 16, {
    color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
  }));

  // Body
  if (opts.body) {
    elements.push(createText(mx + PAD, currY + 56, opts.body, 13, {
      color: WF.textSecondary, font: FONT.sans, frameId,
    }));
  }

  // Action buttons
  const actions = opts.actions || ["Cancelar", "Confirmar"];
  const actBtnW = (MODAL_W - PAD * 2 - 8) / actions.length;
  for (let i = 0; i < actions.length; i++) {
    const ax = mx + PAD + i * (actBtnW + 8);
    const isConfirm = i === actions.length - 1;
    elements.push(createRect(ax, currY + 162, actBtnW, 38, {
      bg: isConfirm ? WF.accent : WF.surface,
      stroke: isConfirm ? "transparent" : WF.border,
      rounded: true, frameId,
    }));
    elements.push(createText(ax + actBtnW / 2, currY + 181, actions[i], 13, {
      align: "center",
      color: isConfirm ? WF.white : WF.textPrimary,
      font: FONT.sans, bold: isConfirm, frameId,
    }));
  }

  return { elements, height: 260 };
}

function renderListItem(ox, oy, w, opts, frameId) {
  const PAD = 16;
  const H = 60;
  const elements = [];

  // Divider at top (list item pattern)
  elements.push(createLine(ox + PAD, oy, ox + w - PAD, oy, { stroke: WF.surface2, frameId }));

  // Icon placeholder
  if (opts.hasIcon !== false) {
    elements.push(createEllipse(ox + PAD, oy + (H - 36) / 2, 36, 36, {
      bg: WF.accentLight, stroke: WF.border, strokeWidth: 1, frameId,
    }));
  }

  const textX = opts.hasIcon !== false ? ox + PAD + 46 : ox + PAD;

  // Title
  elements.push(createText(textX, oy + 14, opts.title || "Item", 14, {
    color: WF.textPrimary, font: FONT.sans, bold: true, frameId,
  }));

  // Meta
  if (opts.meta) {
    elements.push(createText(textX, oy + 34, opts.meta, 12, {
      color: WF.textSecondary, font: FONT.sans, frameId,
    }));
  }

  // Arrow
  if (opts.hasArrow !== false) {
    elements.push(createText(ox + w - PAD - 16, oy + H / 2, "›", 20, {
      align: "right", color: WF.textDisabled, frameId,
    }));
  }

  return { elements, height: H };
}

// ─── Component Dispatcher ───────────────────────────────────────────────────

const COMPONENT_RENDERERS = {
  header: renderHeader,
  search: renderSearch,
  hero: renderHero,
  section_title: renderSectionTitle,
  card_row: renderCardRow,
  card_list: renderCardList,
  tabs: renderTabs,
  button: renderButton,
  input: renderInput,
  nav_bar: renderNavBar,
  text_block: renderTextBlock,
  image_placeholder: renderImagePlaceholder,
  divider: renderDivider,
  avatar_row: renderAvatarRow,
  stat_row: renderStatRow,
  form: renderForm,
  modal: renderModal,
  list_item: renderListItem,
};

// ─── Screen Frame Renderer ───────────────────────────────────────────────────

const SCREEN_SIZES = {
  mobile: { w: 390, h: 844 },   // iPhone 14 logical pixels * 1.5 for canvas readability
  desktop: { w: 1280, h: 800 },
  tablet: { w: 768, h: 1024 },
};
const SCALE = 1.5; // scale up for readability on canvas

function renderScreen(screen, offsetX) {
  const type = screen.type || "mobile";
  const baseSize = SCREEN_SIZES[type] || SCREEN_SIZES.mobile;
  const SW = baseSize.w * SCALE;
  const SH = baseSize.h * SCALE;

  const elements = [];
  const frameId = "frame-" + uuid();

  // Frame element (named after screen)
  elements.push({
    ...baseProps(null),
    id: frameId,
    type: "frame",
    x: offsetX,
    y: 0,
    width: SW,
    height: SH,
    name: screen.name || "Screen",
    strokeColor: WF.borderDark,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    roundness: null,
    frameId: null,
  });

  // Screen background
  elements.push(createRect(offsetX, 0, SW, SH, {
    bg: WF.bg, stroke: WF.border, frameId,
  }));

  // Status bar (mobile only)
  if (type === "mobile") {
    elements.push(createRect(offsetX, 0, SW, 30 * SCALE * 0.6, {
      bg: WF.surface, stroke: "transparent", frameId,
    }));
    elements.push(createText(offsetX + SW / 2, 12, "9:41", 10, {
      align: "center", color: WF.textSecondary, font: FONT.sans, frameId,
    }));
  }

  // Render components
  const startY = type === "mobile" ? 18 : 0;
  let currY = startY;

  for (const comp of screen.components || []) {
    const renderer = COMPONENT_RENDERERS[comp.kind];
    if (!renderer) continue;

    const result = renderer(offsetX, currY, SW, comp, frameId);
    elements.push(...result.elements);
    currY += result.height;

    // Stop if we exceed screen height (leave room for nav bar)
    if (currY > SH - 80) break;
  }

  return { elements, width: SW, frameId };
}

// ─── Main Export ─────────────────────────────────────────────────────────────

function generateWireframeScene(spec) {
  const screens = spec.screens || [];
  const GAP = 80; // gap between screens
  const allElements = [];
  const frameMap = {}; // screen name → { frameId, x, w }

  let currentX = 0;

  // First pass: render all screens
  for (const screen of screens) {
    const result = renderScreen(screen, currentX);
    allElements.push(...result.elements);
    frameMap[screen.name] = { frameId: result.frameId, x: currentX, w: result.width };
    currentX += result.width + GAP;
  }

  // Second pass: render navigation arrows between screens
  for (const screen of screens) {
    const src = frameMap[screen.name];
    if (!src) continue;

    for (const flow of screen.flows || []) {
      const dst = frameMap[flow.to];
      if (!dst) continue;

      const SCREEN_H = (SCREEN_SIZES[(screen.type || "mobile")].h * SCALE);
      const x1 = src.x + src.w;
      const y1 = SCREEN_H / 2;
      const x2 = dst.x;
      const y2 = SCREEN_H / 2;

      allElements.push(...createArrow(x1, y1, x2, y2, flow.label || "", {
        stroke: WF.accent,
        elbowed: false,
      }));
    }
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "https://wireframe-ai.local",
    elements: allElements,
    appState: { viewBackgroundColor: "#F8FAFC" },
    files: {},
  };
}

module.exports = { generateWireframeScene };
