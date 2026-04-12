"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useArtifact } from "@/hooks/use-artifact";
import { fetcher, generateUUID } from "@/lib/utils";
import { DocumentIcon, LoaderIcon, PlusIcon } from "./icons";

interface SpecDocumentSummary {
  id: string;
  version_id: string;
  title: string;
  valid_from: string;
}

interface FeatureSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  feature_type: string;
}

interface BugSummary {
  id: string;
  title: string;
  status: string;
  severity: string;
  priority: string;
}

const statusDots: Record<string, string> = {
  draft: "bg-gray-400",
  triage: "bg-yellow-400",
  backlog: "bg-blue-400",
  spec_generation: "bg-purple-400",
  implementation: "bg-orange-400",
  testing: "bg-cyan-400",
  done: "bg-green-400",
  rejected: "bg-red-400",
};

/**
 * Collapsible sidebar section for SPLM: Features, Bugs, and Backlog.
 */
export function SidebarSPLM() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isCreatingFeature, setIsCreatingFeature] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const newFeatureInputRef = useRef<HTMLInputElement>(null);
  const [isCreatingBug, setIsCreatingBug] = useState(false);
  const [newBugTitle, setNewBugTitle] = useState("");
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const newBugInputRef = useRef<HTMLInputElement>(null);
  const { setOpenMobile } = useSidebar();
  const { setArtifact } = useArtifact();

  const { data: specDocs, isLoading: specDocsLoading } = useSWR<
    SpecDocumentSummary[]
  >(expandedSection === "specs" ? "/api/spec-document" : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: features, isLoading: featuresLoading, mutate: mutateFeatures } = useSWR<
    FeatureSummary[]
  >(expandedSection === "features" ? "/api/features" : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: bugs, isLoading: bugsLoading, mutate: mutateBugs } = useSWR<BugSummary[]>(
    expandedSection === "bugs" ? "/api/bugs" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const handleCreateBug = async () => {
    const title = newBugTitle.trim();
    if (!title) {
      toast.error("Please enter a bug title.");
      return;
    }

    setIsSubmittingBug(true);
    try {
      const id = generateUUID();
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title, status: "draft", priority: "medium", severity: "major" }),
      });

      if (!res.ok) throw new Error("Failed to create bug");

      // Reset form
      setNewBugTitle("");
      setIsCreatingBug(false);

      // Refresh the bugs list
      mutateBugs();

      // Open the new bug in the artifact panel
      setArtifact((current) => ({
        ...current,
        documentId: id,
        kind: "bug" as const,
        title,
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: { top: 0, left: 0, width: 0, height: 0 },
      }));
      setOpenMobile(false);

      toast.success("Bug created!");
    } catch (_error) {
      toast.error("Failed to create bug.");
    } finally {
      setIsSubmittingBug(false);
    }
  };

  const handleCreateFeature = async () => {
    const title = newFeatureTitle.trim();
    if (!title) {
      toast.error("Please enter a feature title.");
      return;
    }

    setIsSubmitting(true);
    try {
      const id = generateUUID();
      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title, status: "draft", priority: "medium" }),
      });

      if (!res.ok) throw new Error("Failed to create feature");

      // Reset form
      setNewFeatureTitle("");
      setIsCreatingFeature(false);

      // Refresh the features list
      mutateFeatures();

      // Open the new feature in the artifact panel
      setArtifact((current) => ({
        ...current,
        documentId: id,
        kind: "feature" as const,
        title,
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: { top: 0, left: 0, width: 0, height: 0 },
      }));
      setOpenMobile(false);

      toast.success("Feature created!");
    } catch (_error) {
      toast.error("Failed to create feature.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Spec Documents */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => toggleSection("specs")}
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
        {expandedSection === "specs" && (
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

      {/* Features */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => toggleSection("features")}
        >
          <span className="flex items-center gap-1.5">
            <span>✨</span>
            <span>Features</span>
            {features && (
              <span className="text-xs text-muted-foreground ml-auto">
                {features.length}
              </span>
            )}
          </span>
        </SidebarGroupLabel>
        <SidebarGroupAction
          title="New feature"
          onClick={(e) => {
            e.stopPropagation();
            // Expand the section if not already
            if (expandedSection !== "features") {
              setExpandedSection("features");
            }
            setIsCreatingFeature(true);
            // Focus will be set via useEffect-like autoFocus
            setTimeout(() => newFeatureInputRef.current?.focus(), 50);
          }}
        >
          <PlusIcon size={16} />
        </SidebarGroupAction>
        {expandedSection === "features" && (
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Inline create form */}
              {isCreatingFeature && (
                <SidebarMenuItem>
                  <form
                    className="flex items-center gap-1.5 px-2 py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateFeature();
                    }}
                  >
                    <input
                      ref={newFeatureInputRef}
                      type="text"
                      className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                      placeholder="Feature title…"
                      value={newFeatureTitle}
                      onChange={(e) => setNewFeatureTitle(e.target.value)}
                      disabled={isSubmitting}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setIsCreatingFeature(false);
                          setNewFeatureTitle("");
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !newFeatureTitle.trim()}
                      className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? "…" : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingFeature(false);
                        setNewFeatureTitle("");
                      }}
                      className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✕
                    </button>
                  </form>
                </SidebarMenuItem>
              )}
              {featuresLoading ? (
                <div className="flex items-center justify-center py-3">
                  <LoaderIcon />
                </div>
              ) : features && features.length > 0 ? (
                features.slice(0, 20).map((feature) => (
                  <SidebarMenuItem key={feature.id}>
                    <SidebarMenuButton
                      className="flex items-center gap-2 text-sm"
                      title={`${feature.title} (${feature.status})`}
                      onClick={() => {
                        setArtifact((current) => ({
                          ...current,
                          documentId: feature.id,
                          kind: "feature" as const,
                          title: feature.title,
                          content: "",
                          isVisible: true,
                          status: "idle",
                          boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                        }));
                        setOpenMobile(false);
                      }}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${statusDots[feature.status] ?? "bg-gray-300"}`}
                      />
                      <span className="truncate flex-1">
                        {feature.title}
                      </span>
                      {feature.feature_type === "sub_feature" && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          sub
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No features yet
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        )}
      </SidebarGroup>

      {/* Bugs */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => toggleSection("bugs")}
        >
          <span className="flex items-center gap-1.5">
            <span>🐛</span>
            <span>Bugs</span>
            {bugs && (
              <span className="text-xs text-muted-foreground ml-auto">
                {bugs.length}
              </span>
            )}
          </span>
        </SidebarGroupLabel>
        <SidebarGroupAction
          title="New bug"
          onClick={(e) => {
            e.stopPropagation();
            if (expandedSection !== "bugs") {
              setExpandedSection("bugs");
            }
            setIsCreatingBug(true);
            setTimeout(() => newBugInputRef.current?.focus(), 50);
          }}
        >
          <PlusIcon size={16} />
        </SidebarGroupAction>
        {expandedSection === "bugs" && (
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Inline create form */}
              {isCreatingBug && (
                <SidebarMenuItem>
                  <form
                    className="flex items-center gap-1.5 px-2 py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateBug();
                    }}
                  >
                    <input
                      ref={newBugInputRef}
                      type="text"
                      className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                      placeholder="Bug title…"
                      value={newBugTitle}
                      onChange={(e) => setNewBugTitle(e.target.value)}
                      disabled={isSubmittingBug}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setIsCreatingBug(false);
                          setNewBugTitle("");
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingBug || !newBugTitle.trim()}
                      className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {isSubmittingBug ? "…" : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingBug(false);
                        setNewBugTitle("");
                      }}
                      className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✕
                    </button>
                  </form>
                </SidebarMenuItem>
              )}
              {bugsLoading ? (
                <div className="flex items-center justify-center py-3">
                  <LoaderIcon />
                </div>
              ) : bugs && bugs.length > 0 ? (
                bugs.slice(0, 20).map((bug) => (
                  <SidebarMenuItem key={bug.id}>
                    <SidebarMenuButton
                      className="flex items-center gap-2 text-sm"
                      title={`${bug.title} (${bug.severity} / ${bug.status})`}
                      onClick={() => {
                        setArtifact((current) => ({
                          ...current,
                          documentId: bug.id,
                          kind: "bug" as const,
                          title: bug.title,
                          content: "",
                          isVisible: true,
                          status: "idle",
                          boundingBox: { top: 0, left: 0, width: 0, height: 0 },
                        }));
                        setOpenMobile(false);
                      }}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${statusDots[bug.status] ?? "bg-gray-300"}`}
                      />
                      <span className="truncate flex-1">{bug.title}</span>
                      <span
                        className={`text-xs shrink-0 ${
                          bug.severity === "blocker" || bug.severity === "critical"
                            ? "text-red-500 font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {bug.severity}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No bugs yet
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
