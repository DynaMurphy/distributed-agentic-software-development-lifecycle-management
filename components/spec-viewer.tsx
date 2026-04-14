"use client";

import { useCallback, useEffect, useRef } from "react";
import { Response } from "@/components/elements/response";
import { useArtifact } from "@/hooks/use-artifact";

/**
 * Read-only spec viewer that renders markdown via Streamdown.
 * Mermaid diagrams are rendered via mermaid.js post-render in the Response component.
 * Also intercepts splm://doc/{id} links to navigate between documents.
 */
export function SpecViewer({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setArtifact } = useArtifact();

  // Handle splm:// link clicks
  const handleClick = useCallback(
    (e: MouseEvent) => {
      const target = (e.target as Element).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href?.startsWith("splm://doc/")) return;

      e.preventDefault();
      e.stopPropagation();

      const docId = href.replace("splm://doc/", "");
      if (!docId) return;

      // Navigate to the target document
      setArtifact((current) => ({
        ...current,
        documentId: docId,
        kind: "spec" as const,
        title: target.textContent ?? "Document",
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: { top: 0, left: 0, width: 0, height: 0 },
      }));
    },
    [setArtifact],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [handleClick]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-6 py-4">
      <Response>{content}</Response>
    </div>
  );
}
