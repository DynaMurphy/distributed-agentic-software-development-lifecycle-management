/**
 * Milkdown plugin that renders live mermaid diagram previews below
 * code blocks with language "mermaid".
 *
 * Uses ProseMirror widget decorations so the CodeMirror code-block
 * nodeView remains fully functional for editing.
 */
import type { Editor } from "@milkdown/kit/core";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { DecorationSet, Decoration } from "@milkdown/kit/prose/view";

let mermaidModule: typeof import("mermaid") | null = null;
let mermaidIdCounter = 0;

async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import("mermaid");
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
    });
  }
  return mermaidModule.default;
}

const mermaidPluginKey = new PluginKey("milkdown-mermaid");

/**
 * Render a mermaid diagram into a container element.
 * Returns the container so it can be used as a widget decoration.
 */
async function renderMermaidWidget(
  code: string,
  container: HTMLElement,
): Promise<void> {
  if (!code.trim()) {
    container.innerHTML =
      '<p class="mermaid-empty">Empty mermaid diagram</p>';
    return;
  }
  try {
    const mermaid = await getMermaid();
    const id = `mermaid-${++mermaidIdCounter}`;
    const { svg } = await mermaid.render(id, code);
    container.innerHTML = svg;
  } catch {
    container.innerHTML =
      '<pre class="mermaid-error">Invalid mermaid syntax</pre>';
  }
}

/** Track rendered widgets so we avoid redundant re-renders. */
const widgetCache = new WeakMap<HTMLElement, string>();

const mermaidProsePlugin = $prose(() => {
  return new Plugin({
    key: mermaidPluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state);
      },
      apply(tr, old, _oldState, newState) {
        // Only rebuild decorations when doc changes
        if (tr.docChanged) {
          return buildDecorations(newState);
        }
        return old.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return mermaidPluginKey.getState(state);
      },
    },
  });
});

function buildDecorations(
  state: import("@milkdown/kit/prose/state").EditorState,
): DecorationSet {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name === "code_block" && node.attrs.language === "mermaid") {
      const endPos = pos + node.nodeSize;
      const code = node.textContent;

      const widget = Decoration.widget(endPos, () => {
        const container = document.createElement("div");
        container.className = "mermaid-preview";
        container.setAttribute("contenteditable", "false");

        // Render asynchronously
        renderMermaidWidget(code, container);
        widgetCache.set(container, code);

        return container;
      }, {
        side: 1, // appear after the node
        key: `mermaid-${pos}`,
      });

      decorations.push(widget);
    }
  });

  return DecorationSet.create(state.doc, decorations);
}

/**
 * Mermaid feature for Crepe's `addFeature()`.
 * Renders live previews below ```mermaid code blocks.
 */
export const mermaidFeature = (editor: Editor) => {
  editor.use(mermaidProsePlugin);
};
