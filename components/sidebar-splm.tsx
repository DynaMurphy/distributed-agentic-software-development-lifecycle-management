"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  GitBranchIcon,
  SettingsIcon,
  CheckIcon,
  GlobeIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
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
import { useSelectedRepository } from "@/hooks/use-selected-repository";
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

interface RepositorySummary {
  id: string;
  name: string;
  full_name: string;
  status: string;
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
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoFullName, setNewRepoFullName] = useState("");
  const [newRepoGithubUrl, setNewRepoGithubUrl] = useState("");
  const [isSubmittingRepo, setIsSubmittingRepo] = useState(false);
  const newRepoInputRef = useRef<HTMLInputElement>(null);
  const [managingRepos, setManagingRepos] = useState(false);
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [editRepoName, setEditRepoName] = useState("");
  const [editRepoFullName, setEditRepoFullName] = useState("");
  const [editRepoGithubUrl, setEditRepoGithubUrl] = useState("");
  const [editRepoDescription, setEditRepoDescription] = useState("");
  const [editRepoStatus, setEditRepoStatus] = useState<"active" | "archived">("active");
  const [isUpdatingRepo, setIsUpdatingRepo] = useState(false);
  const { setOpenMobile } = useSidebar();
  const { setArtifact } = useArtifact();
  const { selectedRepositoryId, setSelectedRepositoryId } = useSelectedRepository();

  const { data: repositories, mutate: mutateRepositories } = useSWR<RepositorySummary[]>(
    "/api/repositories",
    fetcher,
    { revalidateOnFocus: false }
  );

  const repoParam = selectedRepositoryId
    ? `?repositoryId=${selectedRepositoryId}`
    : "";

  const { data: specDocs, isLoading: specDocsLoading } = useSWR<
    SpecDocumentSummary[]
  >(expandedSection === "specs" ? `/api/spec-document${repoParam}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: features, isLoading: featuresLoading, mutate: mutateFeatures } = useSWR<
    FeatureSummary[]
  >(expandedSection === "features" ? `/api/features${repoParam}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: bugs, isLoading: bugsLoading, mutate: mutateBugs } = useSWR<BugSummary[]>(
    expandedSection === "bugs" ? `/api/bugs${repoParam}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const handleCreateRepo = async () => {
    const name = newRepoName.trim();
    if (!name) {
      toast.error("Please enter a repository name.");
      return;
    }

    setIsSubmittingRepo(true);
    try {
      const id = generateUUID();
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          fullName: newRepoFullName.trim() || undefined,
          githubUrl: newRepoGithubUrl.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create repository");

      setNewRepoName("");
      setNewRepoFullName("");
      setNewRepoGithubUrl("");
      setIsCreatingRepo(false);
      mutateRepositories();
      setSelectedRepositoryId(id);
      toast.success("Repository created!");
    } catch (_error) {
      toast.error("Failed to create repository.");
    } finally {
      setIsSubmittingRepo(false);
    }
  };

  const handleStartEditRepo = async (repoId: string) => {
    try {
      const res = await fetch(`/api/repositories?id=${repoId}`);
      if (!res.ok) throw new Error();
      const repo = await res.json();
      setEditRepoName(repo.name ?? "");
      setEditRepoFullName(repo.full_name ?? "");
      setEditRepoGithubUrl(repo.github_url ?? "");
      setEditRepoDescription(repo.description ?? "");
      setEditRepoStatus(repo.status ?? "active");
      setEditingRepoId(repoId);
    } catch {
      toast.error("Failed to load repository details.");
    }
  };

  const handleUpdateRepo = async () => {
    if (!editingRepoId) return;
    const name = editRepoName.trim();
    if (!name) {
      toast.error("Repository name is required.");
      return;
    }
    setIsUpdatingRepo(true);
    try {
      const res = await fetch(`/api/repositories?id=${editingRepoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          fullName: editRepoFullName.trim() || undefined,
          githubUrl: editRepoGithubUrl.trim() || undefined,
          description: editRepoDescription.trim() || undefined,
          status: editRepoStatus,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingRepoId(null);
      mutateRepositories();
      toast.success("Repository updated!");
    } catch {
      toast.error("Failed to update repository.");
    } finally {
      setIsUpdatingRepo(false);
    }
  };

  const handleCancelEditRepo = () => {
    setEditingRepoId(null);
    setEditRepoName("");
    setEditRepoFullName("");
    setEditRepoGithubUrl("");
    setEditRepoDescription("");
    setEditRepoStatus("active");
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
        body: JSON.stringify({ id, title, status: "draft", priority: "medium", severity: "major", ...(selectedRepositoryId && { repositoryId: selectedRepositoryId }) }),
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
        body: JSON.stringify({ id, title, status: "draft", priority: "medium", ...(selectedRepositoryId && { repositoryId: selectedRepositoryId }) }),
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
      {/* Repository Selector & Management */}
      <SidebarGroup>
        <SidebarGroupLabel
          className="cursor-pointer select-none"
          onClick={() => setManagingRepos((prev) => !prev)}
        >
          <span className="flex items-center gap-1.5">
            <GitBranchIcon size={14} />
            <span>Repositories</span>
            {repositories && (
              <span className="text-xs text-muted-foreground ml-auto">
                {repositories.length}
              </span>
            )}
          </span>
        </SidebarGroupLabel>
        <SidebarGroupAction
          title="New repository"
          onClick={(e) => {
            e.stopPropagation();
            setManagingRepos(true);
            setIsCreatingRepo(true);
            setTimeout(() => newRepoInputRef.current?.focus(), 50);
          }}
        >
          <PlusIcon size={16} />
        </SidebarGroupAction>
        <SidebarGroupContent>
          {/* Active repository selector */}
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

          {/* Expanded management view */}
          {managingRepos && (
            <SidebarMenu>
              {/* Create form */}
              {isCreatingRepo && (
                <SidebarMenuItem>
                  <form
                    className="flex flex-col gap-1.5 px-2 py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateRepo();
                    }}
                  >
                    <input
                      ref={newRepoInputRef}
                      type="text"
                      className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                      placeholder="Repository name"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      disabled={isSubmittingRepo}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setIsCreatingRepo(false);
                          setNewRepoName("");
                          setNewRepoFullName("");
                          setNewRepoGithubUrl("");
                        }
                      }}
                    />
                    <input
                      type="text"
                      className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                      placeholder="owner/repo (optional)"
                      value={newRepoFullName}
                      onChange={(e) => setNewRepoFullName(e.target.value)}
                      disabled={isSubmittingRepo}
                    />
                    <input
                      type="url"
                      className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                      placeholder="GitHub URL (optional)"
                      value={newRepoGithubUrl}
                      onChange={(e) => setNewRepoGithubUrl(e.target.value)}
                      disabled={isSubmittingRepo}
                    />
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingRepo(false);
                          setNewRepoName("");
                          setNewRepoFullName("");
                          setNewRepoGithubUrl("");
                        }}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingRepo || !newRepoName.trim()}
                        className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {isSubmittingRepo ? "..." : "Create"}
                      </button>
                    </div>
                  </form>
                </SidebarMenuItem>
              )}

              {/* Repository list */}
              {repositories && repositories.length > 0 ? (
                repositories.map((repo) =>
                  editingRepoId === repo.id ? (
                    <SidebarMenuItem key={repo.id}>
                      <form
                        className="flex flex-col gap-1.5 px-2 py-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleUpdateRepo();
                        }}
                      >
                        <input
                          type="text"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                          placeholder="Repository name"
                          value={editRepoName}
                          onChange={(e) => setEditRepoName(e.target.value)}
                          disabled={isUpdatingRepo}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Escape") handleCancelEditRepo();
                          }}
                        />
                        <input
                          type="text"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                          placeholder="owner/repo (optional)"
                          value={editRepoFullName}
                          onChange={(e) => setEditRepoFullName(e.target.value)}
                          disabled={isUpdatingRepo}
                        />
                        <input
                          type="url"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                          placeholder="GitHub URL (optional)"
                          value={editRepoGithubUrl}
                          onChange={(e) => setEditRepoGithubUrl(e.target.value)}
                          disabled={isUpdatingRepo}
                        />
                        <textarea
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground resize-none"
                          placeholder="Description (optional)"
                          rows={2}
                          value={editRepoDescription}
                          onChange={(e) => setEditRepoDescription(e.target.value)}
                          disabled={isUpdatingRepo}
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Status</label>
                          <select
                            value={editRepoStatus}
                            onChange={(e) => setEditRepoStatus(e.target.value as "active" | "archived")}
                            className="rounded-md border bg-background px-2 py-1 text-xs cursor-pointer"
                            disabled={isUpdatingRepo}
                          >
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={handleCancelEditRepo}
                            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isUpdatingRepo || !editRepoName.trim()}
                            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {isUpdatingRepo ? "..." : "Save"}
                          </button>
                        </div>
                      </form>
                    </SidebarMenuItem>
                  ) : (
                    <SidebarMenuItem key={repo.id}>
                      <SidebarMenuButton
                        className="flex items-center gap-2 text-sm group/repo"
                        title={repo.full_name || repo.name}
                        onClick={() => setSelectedRepositoryId(repo.id)}
                      >
                        {selectedRepositoryId === repo.id ? (
                          <CheckIcon size={14} className="shrink-0 text-primary" />
                        ) : (
                          <GlobeIcon size={14} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate flex-1">
                          {repo.full_name || repo.name}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="shrink-0 opacity-0 group-hover/repo:opacity-100 p-0.5 rounded hover:bg-accent transition-all cursor-pointer"
                          title="Edit repository"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditRepo(repo.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              handleStartEditRepo(repo.id);
                            }
                          }}
                        >
                          <PencilIcon size={12} />
                        </span>
                        <span
                          className={`text-xs shrink-0 ${
                            repo.status === "active"
                              ? "text-green-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {repo.status}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                )
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No repositories yet
                </div>
              )}
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

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
