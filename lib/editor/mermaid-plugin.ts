/**
 * Milkdown mermaid rendering via Crepe's CodeMirror renderPreview config.
 *
 * Instead of a ProseMirror plugin that scans the DOM (which caused freezes),
 * this uses the native `renderPreview` callback in the CodeBlockConfig.
 * When a code block's language is "mermaid", the callback renders the
 * diagram SVG into the preview area managed by the code-block component.
 *
 * Performance optimisations:
 *   1. svgCache — reuses rendered SVG when diagram code hasn't changed.
 *   2. prefetchMermaid — lets callers warm the ~2 MB mermaid bundle early.
 */

let mermaidModule: typeof import("mermaid") | null = null;
let mermaidIdCounter = 0;

async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import("mermaid");
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      suppressErrorRendering: true,
      // Use SVG <text> instead of <foreignObject> HTML for labels.
      // This avoids Milkdown's aggressive CSS reset (.milkdown *)
      // stripping margin/padding/font-size from foreignObject content.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
  }
  return mermaidModule.default;
}

/**
 * Warm the mermaid bundle without rendering anything.
 * Call this on hover over any UI element that might open a spec document.
 */
export function prefetchMermaid(): void {
  getMermaid();
}

/** code string → rendered SVG string. Persists across decoration rebuilds. */
const svgCache = new Map<string, string>();

/**
 * Render mermaid code to SVG string. Uses the shared svgCache.
 * Safe to call from any component.
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
  if (!code.trim()) return "";
  const cached = svgCache.get(code);
  if (cached) return cached;
  try {
    const mermaid = await getMermaid();
    const id = `mermaid-${++mermaidIdCounter}`;
    const { svg } = await mermaid.render(id, code);
    svgCache.set(code, svg);
    return svg;
  } catch {
    return '<pre class="mermaid-error">Invalid mermaid syntax</pre>';
  }
}

/**
 * renderPreview callback for Crepe's CodeMirror featureConfig.
 * Handles "mermaid" language code blocks; returns null for all others
 * so the default behaviour applies.
 *
 * Usage in milkdown-editor.tsx featureConfigs:
 *   [Crepe.Feature.CodeMirror]: {
 *     renderPreview: mermaidRenderPreview,
 *     previewOnlyByDefault: false,
 *   }
 */
export function mermaidRenderPreview(
  language: string,
  content: string,
  applyPreview: (value: null | string | HTMLElement) => void,
): void | null | string | HTMLElement {
  if (language !== "mermaid") return null;

  const trimmed = content.trim();
  if (!trimmed) return null;

  // Return cached SVG immediately if available
  const cached = svgCache.get(trimmed);
  if (cached) {
    const el = document.createElement("div");
    el.className = "mermaid-preview";
    el.innerHTML = cached;
    return el;
  }

  // Async render — return nothing now, apply when ready
  renderMermaidToSvg(trimmed).then((svg) => {
    const el = document.createElement("div");
    el.className = "mermaid-preview";
    el.innerHTML = svg;
    applyPreview(el);
  });

  return undefined;
}
