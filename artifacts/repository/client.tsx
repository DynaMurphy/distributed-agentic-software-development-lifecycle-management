"use client";

import { useCallback, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  CheckIcon,
  GitBranchIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import { CopyIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import { fetcher, generateUUID } from "@/lib/utils";

interface RepositoryData {
  id: string;
  name: string;
  full_name: string;
  description?: string;
  github_url?: string;
  default_branch?: string;
  status: string;
  valid_from?: string;
}

type RepositoryArtifactMetadata = {
  editingRepoId: string | null;
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived:
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateRepoForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { selectedRepositoryId, setSelectedRepositoryId } =
    useSelectedRepository();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a repository name.");
      return;
    }
    setIsSubmitting(true);
    try {
      const id = generateUUID();
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: trimmed,
          fullName: fullName.trim() || undefined,
          githubUrl: githubUrl.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create repository");
      setSelectedRepositoryId(id);
      toast.success("Repository created!");
      onCreated();
    } catch {
      toast.error("Failed to create repository.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
            placeholder="Repository name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
          />
          <input
            type="text"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
            placeholder="owner/repo (optional)"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isSubmitting}
          />
          <input
            type="url"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
            placeholder="GitHub URL (optional)"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit form (inline card)
// ---------------------------------------------------------------------------

function EditRepoForm({
  repo,
  onSaved,
  onCancel,
}: {
  repo: RepositoryData;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(repo.name);
  const [fullName, setFullName] = useState(repo.full_name ?? "");
  const [githubUrl, setGithubUrl] = useState(repo.github_url ?? "");
  const [description, setDescription] = useState(repo.description ?? "");
  const [status, setStatus] = useState(repo.status ?? "active");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Repository name is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/repositories?id=${repo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          fullName: fullName.trim() || undefined,
          githubUrl: githubUrl.trim() || undefined,
          description: description.trim() || undefined,
          status,
        }),
      });
      if (!res.ok) throw new Error("Failed to update repository");
      toast.success("Repository updated!");
      onSaved();
    } catch {
      toast.error("Failed to update repository.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-primary/50">
      <CardContent className="p-4">
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
            placeholder="Repository name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
          />
          <input
            type="text"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
            placeholder="owner/repo (optional)"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isSubmitting}
          />
          <input
            type="url"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
            placeholder="GitHub URL (optional)"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            disabled={isSubmitting}
          />
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground resize-none"
            placeholder="Description (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs cursor-pointer"
              disabled={isSubmitting}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Browser view
// ---------------------------------------------------------------------------

function RepositoriesBrowserView() {
  const { data: repositories, isLoading } = useSWR<RepositoryData[]>(
    "/api/repositories",
    fetcher,
    { revalidateOnFocus: false },
  );
  const { mutate } = useSWRConfig();
  const { selectedRepositoryId, setSelectedRepositoryId } =
    useSelectedRepository();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) {
    return <DocumentSkeleton artifactKind="text" />;
  }

  const filtered =
    repositories?.filter(
      (r) => statusFilter === "all" || r.status === statusFilter,
    ) ?? [];

  const statusFilters = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <GitBranchIcon className="size-5" />
          <div>
            <h2 className="text-lg font-semibold">Repositories</h2>
            <p className="text-xs text-muted-foreground">
              Manage code repositories
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{repositories?.length ?? 0} repos</Badge>
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <PlusIcon className="mr-1.5 size-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b px-6 py-2">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {isCreating && (
            <CreateRepoForm
              onCreated={() => {
                setIsCreating(false);
                mutate("/api/repositories");
              }}
              onCancel={() => setIsCreating(false)}
            />
          )}

          {filtered.length === 0 && !isCreating ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
              <GitBranchIcon className="mb-3 size-12 opacity-30" />
              <p>No repositories found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setIsCreating(true)}
              >
                <PlusIcon className="mr-1.5 size-3.5" />
                Create Repository
              </Button>
            </div>
          ) : (
            filtered.map((repo) =>
              editingId === repo.id ? (
                <EditRepoForm
                  key={repo.id}
                  repo={repo}
                  onSaved={() => {
                    setEditingId(null);
                    mutate("/api/repositories");
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <Card
                  key={repo.id}
                  className={`cursor-pointer transition-colors hover:bg-accent ${
                    selectedRepositoryId === repo.id
                      ? "border-primary bg-accent"
                      : ""
                  }`}
                  onClick={() => setSelectedRepositoryId(repo.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {repo.full_name || repo.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5">
                        {selectedRepositoryId === repo.id && (
                          <CheckIcon className="size-3.5 text-primary" />
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusColors[repo.status] ?? ""}`}
                        >
                          {repo.status}
                        </Badge>
                      </div>
                    </div>
                    {repo.description && (
                      <CardDescription className="text-xs line-clamp-2">
                        {repo.description}
                      </CardDescription>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      {repo.github_url && (
                        <a
                          href={repo.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GlobeIcon className="inline mr-1 size-3" />
                          GitHub
                        </a>
                      )}
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(repo.id);
                        }}
                      >
                        <PencilIcon className="inline mr-0.5 size-3" />
                        Edit
                      </button>
                    </div>
                  </CardHeader>
                </Card>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artifact definition
// ---------------------------------------------------------------------------

export const repositoryArtifact = new Artifact<
  "repository",
  RepositoryArtifactMetadata
>({
  kind: "repository",
  description: "Repository browser and management.",

  initialize: ({ setMetadata }) => {
    setMetadata({ editingRepoId: null });
  },

  onStreamPart: () => {},

  content: ({ isLoading }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }
    return <RepositoriesBrowserView />;
  },

  actions: [
    {
      icon: <CopyIcon size={18} />,
      description: "Copy repository list",
      onClick: async () => {
        try {
          const res = await fetch("/api/repositories");
          const repos: RepositoryData[] = await res.json();
          const text = repos
            .map((r) => `${r.full_name || r.name} (${r.status})`)
            .join("\n");
          navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard!");
        } catch {
          toast.error("Failed to copy.");
        }
      },
    },
  ],

  toolbar: [],
});
