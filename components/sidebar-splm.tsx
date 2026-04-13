"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useArtifact } from "@/hooks/use-artifact";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import { fetcher } from "@/lib/utils";
import { DocumentIcon, LoaderIcon } from "./icons";
import { prefetchMermaid } from "@/lib/editor/mermaid-plugin";

interface SpecDocumentSummary {
  id: string;
  version_id: string;
  title: string;
  valid_from: string;
}

interface RepositorySummary {
  id: string;
  name: string;
  full_name: string;
  status: string;
}

/**
 * Sidebar section for SPLM: Repository selector, Spec Documents, and Backlog.
 * Features, Bugs, and Repositories are now opened from the main sidebar menu items.
 */
export function SidebarSPLM() {
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const { setOpenMobile } = useSidebar();
  const { setArtifact } = useArtifact();
  const { selectedRepositoryId, setSelectedRepositoryId } = useSelectedRepository();

  const { data: repositories } = useSWR<RepositorySummary[]>(
    "/api/repositories",
    fetcher,
    { revalidateOnFocus: false }
  );

  const repoParam = selectedRepositoryId
    ? `?repositoryId=${selectedRepositoryId}`
    : "";

  const { data: specDocs, isLoading: specDocsLoading } = useSWR<
    SpecDocumentSummary[]
  >(specsExpanded ? `/api/spec-document${repoParam}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <>
      {/* Repository Selector */}
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 pb-1.5">
            <select
              value={selectedRepositoryId}
              onChange={(e) => setSelectedRepositoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <option value="">All Repositories</option>
              {repositories?.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.full_name || repo.name}
                </option>
              ))}
            </select>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Spec Documents */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => setSpecsExpanded((prev) => !prev)}
          onMouseEnter={prefetchMermaid}
        >
          <span className="flex items-center gap-1.5">
            <DocumentIcon size={14} />
            <span>Spec Documents</span>
            {specDocs && (
              <span className="text-xs text-muted-foreground ml-auto">
                {specDocs.length}
              </span>
            )}
          </span>
        </SidebarGroupLabel>
        {specsExpanded && (
          <SidebarGroupContent>
            <SidebarMenu>
              {specDocsLoading ? (
                <div className="flex items-center justify-center py-3">
                  <LoaderIcon />
                </div>
              ) : specDocs && specDocs.length > 0 ? (
                specDocs.slice(0, 20).map((doc) => (
                  <SidebarMenuItem key={doc.version_id}>
                    <SidebarMenuButton
                      className="flex items-center gap-2 text-sm"
                      title={doc.title}
                      onClick={() => {
                        setArtifact((current) => ({
                          ...current,
                          documentId: doc.id,
                          kind: "spec" as const,
                          title: doc.title,
                          content: "",
                          isVisible: true,
                          status: "idle",
                          boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                        }));
                        setOpenMobile(false);
                      }}
                    >
                      <DocumentIcon size={14} />
                      <span className="truncate flex-1">{doc.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(doc.valid_from).toLocaleDateString()}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No spec documents yet
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        )}
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
    </>
  );
}
