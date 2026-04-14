"use client";

import { useSidebar } from "@/components/ui/sidebar";
import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useArtifact } from "@/hooks/use-artifact";

/**
 * Sidebar section for SPLM: Backlog.
 * Documents, Features, Bugs, Skills, Templates, and Repositories
 * are now opened from the main sidebar menu items.
 */
export function SidebarSPLM() {
  const { setOpenMobile } = useSidebar();
  const { setArtifact } = useArtifact();

  return (
    <>
      {/* Capabilities */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => {
            setArtifact((current) => ({
              ...current,
              documentId: "capabilities-browser",
              kind: "capability" as const,
              title: "Capabilities",
              content: "",
              isVisible: true,
              status: "idle",
              boundingBox: { top: 0, left: 0, width: 0, height: 0 },
            }));
            setOpenMobile(false);
          }}
        >
          <span className="flex items-center gap-1.5">
            <span>🧩</span>
            <span>Capabilities</span>
          </span>
        </SidebarGroupLabel>
      </SidebarGroup>

      {/* Backlog */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => {
            setArtifact((current) => ({
              ...current,
              documentId: "backlog-view",
              kind: "backlog" as const,
              title: "Product Backlog",
              content: "",
              isVisible: true,
              status: "idle",
              boundingBox: { top: 0, left: 0, width: 0, height: 0 },
            }));
            setOpenMobile(false);
          }}
        >
          <span className="flex items-center gap-1.5">
            <span>📋</span>
            <span>Backlog</span>
          </span>
        </SidebarGroupLabel>
      </SidebarGroup>

      {/* Roadmap */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => {
            setArtifact((current) => ({
              ...current,
              documentId: "roadmap-view",
              kind: "roadmap" as const,
              title: "Product Roadmap",
              content: "",
              isVisible: true,
              status: "idle",
              boundingBox: { top: 0, left: 0, width: 0, height: 0 },
            }));
            setOpenMobile(false);
          }}
        >
          <span className="flex items-center gap-1.5">
            <span>🗺️</span>
            <span>Roadmap</span>
          </span>
        </SidebarGroupLabel>
      </SidebarGroup>

    </>
  );
}
