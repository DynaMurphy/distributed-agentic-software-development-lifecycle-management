"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Streamdown, type CustomRendererProps } from "streamdown";
import { cn } from "@/lib/utils";

type ResponseProps = ComponentProps<typeof Streamdown>;

/** Lazily loaded mermaid instance, shared across all MermaidBlock renders. */
let mermaidInstance: typeof import("mermaid").default | null = null;
let mermaidIdCounter = 0;

async function getMermaid() {
  if (!mermaidInstance) {
    mermaidInstance = (await import("mermaid")).default;
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
      suppressErrorRendering: true,
    });
  }
  return mermaidInstance;
}

/** SVG cache shared across renders to avoid re-rendering identical diagrams. */
const svgCache = new Map<string, string>();

function MermaidBlock({ code, isIncomplete }: CustomRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const renderedCodeRef = useRef<string>("");

  useEffect(() => {
    if (isIncomplete) return; // Don't render while streaming
    const trimmed = code.trim();
    if (!trimmed || trimmed === renderedCodeRef.current) return;

    let cancelled = false;

    (async () => {
      const cached = svgCache.get(trimmed);
      if (cached) {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = cached;
          renderedCodeRef.current = trimmed;
        }
        return;
      }

      try {
        const mermaid = await getMermaid();
        if (cancelled) return;
        const id = `mermaid-sd-${++mermaidIdCounter}`;
        const { svg } = await mermaid.render(id, trimmed);
        svgCache.set(trimmed, svg);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          renderedCodeRef.current = trimmed;
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Invalid mermaid syntax");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, isIncomplete]);

  if (isIncomplete) {
    return (
      <pre className="rounded-md border border-border bg-sidebar p-4 text-sm text-muted-foreground">
        <code>{code}</code>
      </pre>
    );
  }

  if (error) {
    return (
      <pre className="rounded-md border border-destructive/30 bg-sidebar p-4 text-sm text-destructive">
        {error}
      </pre>
    );
  }

  return <div ref={containerRef} className="mermaid-diagram" />;
}

const mermaidRenderer = {
  language: "mermaid",
  component: MermaidBlock,
};

export function Response({ className, children, ...props }: ResponseProps) {
  return (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        className
      )}
      plugins={{ renderers: [mermaidRenderer] }}
      {...props}
    >
      {children}
    </Streamdown>
  );
}
