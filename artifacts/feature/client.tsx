"use client";

import { formatDistance } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ListIcon, PlusIcon } from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  CodeIcon,
  CopyIcon,
  MessageIcon,
  PenIcon,
  SaveIcon,
  SparklesIcon,
} from "@/components/icons";
import { LinkedDocumentsBadge } from "@/components/linked-items";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { CapabilityPicker, CapabilityFilter } from "@/components/capability-picker";
import { TaskList, TaskCompletionSummary } from "@/components/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MilkdownFieldEditor } from "@/components/milkdown-field-editor";
import { useArtifact } from "@/hooks/use-artifact";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import { fetcher, generateUUID } from "@/lib/utils";

/**
 * Parsed feature data from the artifact JSON content.
 */
interface FeatureData {
  id: string;
  version_id?: string;
  title: string;
  description?: string;
  feature_type?: "feature" | "sub_feature";
  parent_id?: string;
  status?: string;
  priority?: string;
  created_by?: string;
  assigned_to?: string;
  tags?: string[];
  ai_metadata?: Record<string, any>;
  valid_from?: string;
  valid_to?: string;
  maintained_by_email?: string;
  sub_features?: FeatureData[];
}

/** Summary used in the version timeline */
interface FeatureVersionSummary {
  version_id: string;
  title: string;
  status: string;
  priority: string;
  valid_from: string;
  valid_to: string;
  maintained_by_email?: string;
}

type FeatureArtifactMetadata = {
  featureId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  /** All versions for the feature (newest last) */
  versions: FeatureVersionSummary[];
  /** Index into `versions` currently being viewed */
  currentVersionIndex: number;
  /** True when restoring a version */
  isRestoring: boolean;
  /** Toggle between WYSIWYG (Milkdown) and raw markdown */
  editorMode: "wysiwyg" | "markdown";
};

interface FeatureSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  feature_type: string;
}

const statusDotColors: Record<string, string> = {
  draft: "bg-gray-400",
  triage: "bg-yellow-500",
  backlog: "bg-blue-500",
  spec_generation: "bg-purple-500",
  implementation: "bg-orange-500",
  testing: "bg-cyan-500",
  done: "bg-green-500",
  rejected: "bg-red-500",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800",
  triage: "bg-yellow-200 text-yellow-800",
  backlog: "bg-blue-200 text-blue-800",
  spec_generation: "bg-purple-200 text-purple-800",
  implementation: "bg-orange-200 text-orange-800",
  testing: "bg-cyan-200 text-cyan-800",
  done: "bg-green-200 text-green-800",
  rejected: "bg-red-200 text-red-800",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  low: "bg-blue-100 text-blue-700 border-blue-300",
};

/** Options for the status select with colored dot indicators */
const statusOptions = [
  { value: "draft", label: "Draft", dot: "bg-gray-400" },
  { value: "triage", label: "Triage", dot: "bg-yellow-500" },
  { value: "backlog", label: "Backlog", dot: "bg-blue-500" },
  { value: "spec_generation", label: "Spec Generation", dot: "bg-purple-500" },
  { value: "implementation", label: "Implementation", dot: "bg-orange-500" },
  { value: "testing", label: "Testing", dot: "bg-cyan-500" },
  { value: "done", label: "Done", dot: "bg-green-500" },
  { value: "rejected", label: "Rejected", dot: "bg-red-500" },
];

/** Options for the priority select with colored dot indicators */
const priorityOptions = [
  { value: "critical", label: "Critical", dot: "bg-red-600" },
  { value: "high", label: "High", dot: "bg-orange-500" },
  { value: "medium", label: "Medium", dot: "bg-yellow-500" },
  { value: "low", label: "Low", dot: "bg-blue-500" },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${priorityColors[priority] ?? "bg-gray-100 text-gray-600"}`}
    >
      {priority}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Version timeline
// ---------------------------------------------------------------------------

function VersionTimeline({
  versions,
  currentIndex,
  onSelect,
}: {
  versions: FeatureVersionSummary[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  if (versions.length <= 1) return null;

  return (
    <div className="flex flex-col gap-1 px-6 py-3 border-b bg-muted/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Version History ({versions.length})
        </span>
        <span className="text-xs text-muted-foreground">
          Viewing {currentIndex + 1} of {versions.length}
        </span>
      </div>
      <div className="flex flex-row gap-1 overflow-x-auto pb-1">
        {versions.map((v, i) => {
          const isCurrent = i === versions.length - 1;
          const isSelected = i === currentIndex;
          return (
            <button
              key={v.version_id}
              type="button"
              onClick={() => onSelect(i)}
              className={`shrink-0 flex flex-col items-start px-3 py-2 rounded-md border text-left text-xs transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-transparent bg-muted/50 hover:bg-muted"
              }`}
            >
              <span className="font-medium truncate max-w-[140px]">
                {isCurrent ? "Current" : `v${i + 1}`}
              </span>
              <span className="text-muted-foreground">
                {formatDistance(new Date(v.valid_from), new Date(), {
                  addSuffix: true,
                })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Feature detail view — displays feature data with structured fields.
 */
function FeatureDetailView({
  feature,
  onFieldChange,
  isCurrentVersion,
  editorMode = "wysiwyg",
}: {
  feature: FeatureData;
  onFieldChange: (field: string, value: any) => void;
  isCurrentVersion: boolean;
  editorMode?: "wysiwyg" | "markdown";
}) {
  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto max-h-full min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {feature.feature_type === "sub_feature"
                ? "Sub-Feature"
                : "Feature"}
            </span>
            <span className="text-xs text-muted-foreground">
              {feature.id?.slice(0, 8)}
            </span>
          </div>
          {isCurrentVersion ? (
            <input
              className="text-xl font-semibold w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-primary/20 rounded px-1 -ml-1"
              defaultValue={feature.title}
              onBlur={(e) => onFieldChange("title", e.target.value)}
              placeholder="Feature title..."
            />
          ) : (
            <h2 className="text-xl font-semibold">{feature.title}</h2>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {feature.status && <StatusBadge status={feature.status} />}
          {feature.priority && <PriorityBadge priority={feature.priority} />}
          {feature.id && (
            <TaskCompletionSummary parentType="feature" parentId={feature.id} />
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Description
        </label>
        {isCurrentVersion ? (
          editorMode === "markdown" ? (
            <textarea
              key={`desc-raw-${feature.id}`}
              className="w-full min-h-[120px] p-3 rounded-md border bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/20"
              defaultValue={feature.description ?? ""}
              onChange={(e) => onFieldChange("description", e.target.value)}
              placeholder="Describe this feature..."
            />
          ) : (
            <MilkdownFieldEditor
              key={`desc-${feature.id}`}
              content={feature.description ?? ""}
              onChange={(value) => onFieldChange("description", value)}
              placeholder="Describe this feature..."
              minHeight="120px"
            />
          )
        ) : (
          <p className="text-sm whitespace-pre-wrap p-3 rounded-md border bg-muted/30">
            {feature.description || "No description"}
          </p>
        )}
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          {isCurrentVersion ? (
            <Select
              defaultValue={feature.status ?? "draft"}
              onValueChange={(value) => onFieldChange("status", value)}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2 rounded-full ${opt.dot}`}
                      />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm p-2">
              {feature.status?.replace(/_/g, " ") ?? "draft"}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Priority
          </label>
          {isCurrentVersion ? (
            <Select
              defaultValue={feature.priority ?? "medium"}
              onValueChange={(value) => onFieldChange("priority", value)}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2 rounded-full ${opt.dot}`}
                      />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm p-2">{feature.priority ?? "medium"}</p>
          )}
        </div>
      </div>

      {/* Tags */}
      {Array.isArray(feature.tags) && feature.tags.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Tags
          </label>
          <div className="flex flex-wrap gap-1.5">
            {feature.tags.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full bg-muted text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {feature.id && (
        <CapabilityPicker
          itemType="feature"
          itemId={feature.id}
          isEditable={isCurrentVersion}
        />
      )}

      {/* Sub-features */}
      {feature.sub_features && feature.sub_features.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Sub-Features ({feature.sub_features.length})
          </label>
          <div className="space-y-2">
            {feature.sub_features.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-3 rounded-md border bg-muted/20"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sub.title}</p>
                  {sub.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {sub.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {sub.status && <StatusBadge status={sub.status} />}
                  {sub.priority && <PriorityBadge priority={sub.priority} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {feature.id && (
        <TaskList parentType="feature" parentId={feature.id} />
      )}

      {/* Linked Documents */}
      {feature.id && (
        <LinkedDocumentsBadge itemType="feature" itemId={feature.id} />
      )}

      {/* AI Insights (shared component) */}
      {feature.ai_metadata && (
        <AIInsightsPanel
          aiMetadata={feature.ai_metadata}
          onAiMetadataChange={
            isCurrentVersion
              ? (updated) => onFieldChange("ai_metadata", updated)
              : undefined
          }
        />
      )}

      {/* Last modified */}
      {feature.valid_from && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Last modified:{" "}
          {new Date(feature.valid_from).toLocaleString()}
          {feature.maintained_by_email && (
            <span> by {feature.maintained_by_email}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser filter options
// ---------------------------------------------------------------------------

const browserStatusFilters = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "triage", label: "Triage" },
  { value: "backlog", label: "Backlog" },
  { value: "implementation", label: "Implementation" },
  { value: "testing", label: "Testing" },
  { value: "done", label: "Done" },
];

// ---------------------------------------------------------------------------
// Browser view — shows all features as a list
// ---------------------------------------------------------------------------

function FeaturesBrowserView({
  setMetadata,
}: {
  setMetadata: React.Dispatch<React.SetStateAction<FeatureArtifactMetadata>>;
}) {
  const { setArtifact } = useArtifact();
  const { selectedRepositoryId } = useSelectedRepository();
  const { mutate } = useSWRConfig();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [capabilityFilter, setCapabilityFilter] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const repoParam = selectedRepositoryId
    ? `?productId=${selectedRepositoryId}`
    : "";
  const { data: features, isLoading } = useSWR<FeatureSummary[]>(
    `/api/features${repoParam}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Fetch capability assignments for all features (eagerly, so filter works immediately)
  const { data: capabilityItemsMap } = useSWR<Record<string, string[]>>(
    "/api/capabilities/item-map?itemType=feature",
    fetcher,
    { revalidateOnFocus: false },
  );

  const filtered = (features ?? []).filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (capabilityFilter.length > 0 && capabilityItemsMap) {
      const featureCaps = capabilityItemsMap[f.id] ?? [];
      if (capabilityFilter.includes("ungrouped") && featureCaps.length === 0) return true;
      const nonUngrouped = capabilityFilter.filter((id) => id !== "ungrouped");
      if (nonUngrouped.length > 0 && nonUngrouped.some((id) => featureCaps.includes(id))) return true;
      return false;
    }
    return true;
  });

  const handleOpen = (feature: FeatureSummary) => {
    setMetadata((prev) => ({
      ...prev,
      featureId: feature.id,
    }));
    setArtifact((current) => ({
      ...current,
      documentId: feature.id,
      title: feature.title,
      content: "",
    }));
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;

    setIsSubmitting(true);
    try {
      const id = generateUUID();
      const body: Record<string, string> = {
        id,
        title,
        status: "draft",
        priority: "medium",
      };
      if (selectedRepositoryId) {
        body.repositoryId = selectedRepositoryId;
      }

      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to create feature");

      toast.success("Feature created!");
      setNewTitle("");
      setIsCreating(false);

      // Refresh the list
      mutate(`/api/features${repoParam}`);

      // Open the newly created feature
      handleOpen({ id, title, status: "draft", priority: "medium", feature_type: "feature" });
    } catch (error) {
      console.error("Create feature error:", error);
      toast.error("Failed to create feature.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <DocumentSkeleton artifactKind="text" />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <ListIcon className="size-5" />
          <div>
            <h2 className="text-lg font-semibold">Features</h2>
            <p className="text-xs text-muted-foreground">
              Browse and manage product features
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{features?.length ?? 0} features</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreating(true)}
          >
            <PlusIcon className="mr-1.5 size-3.5" />
            Create
          </Button>
        </div>
      </div>

      {/* Inline create form */}
      {isCreating && (
        <div className="flex items-center gap-2 border-b px-6 py-3 bg-muted/30">
          <input
            autoFocus
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Feature title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewTitle("");
              }
            }}
          />
          <Button
            size="sm"
            disabled={!newTitle.trim() || isSubmitting}
            onClick={handleCreate}
          >
            {isSubmitting ? "Creating…" : "Add"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsCreating(false);
              setNewTitle("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Status filter bar */}
      <div className="flex items-center gap-1 border-b px-6 py-2 flex-wrap">
        {browserStatusFilters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        <CapabilityFilter
          selectedIds={capabilityFilter}
          onChange={setCapabilityFilter}
          itemType="feature"
        />
      </div>

      {/* Feature list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ListIcon className="mx-auto mb-3 size-12 opacity-30" />
              <p>No features found</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((feature) => (
              <button
                key={feature.id}
                type="button"
                onClick={() => handleOpen(feature)}
                className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-accent"
              >
                {/* Status dot */}
                <span
                  className={`inline-block size-2.5 shrink-0 rounded-full ${
                    statusDotColors[feature.status] ?? "bg-gray-400"
                  }`}
                />

                {/* Title */}
                <span className="flex-1 truncate text-sm font-medium">
                  {feature.title}
                </span>

                {/* Feature type */}
                {feature.feature_type === "sub_feature" && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    sub
                  </Badge>
                )}

                {/* Priority */}
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    priorityColors[feature.priority] ??
                    "bg-gray-100 text-gray-600"
                  }`}
                >
                  {feature.priority}
                </span>

                {/* Status label */}
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusColors[feature.status] ??
                    "bg-gray-100 text-gray-600"
                  }`}
                >
                  {feature.status.replace(/_/g, " ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const featureArtifact = new Artifact<"feature", FeatureArtifactMetadata>(
  {
    kind: "feature",
    description:
      "Feature management artifact — view and edit features with structured fields, sub-features, and AI insights.",

    initialize: async ({ documentId, setMetadata, setArtifact }) => {
      // Browser mode — no feature to fetch
      if (documentId === "features-browser") {
        setMetadata({
          featureId: null,
          isDirty: false,
          isSaving: false,
          versions: [],
          currentVersionIndex: 0,
          isRestoring: false,
          editorMode: "wysiwyg",
        });
        return;
      }

      // Fetch versions in parallel with the current feature data
      let versions: FeatureVersionSummary[] = [];
      try {
        const versionsRes = await fetch(
          `/api/features?id=${documentId}&versions=true`
        );
        if (versionsRes.ok) {
          const data = await versionsRes.json();
          if (Array.isArray(data)) {
            versions = data.map((v: any) => ({
              version_id: v.version_id,
              title: v.title,
              status: v.status,
              priority: v.priority,
              valid_from: v.valid_from,
              valid_to: v.valid_to,
            }));
          }
        }
      } catch {
        // versions will stay empty
      }

      setMetadata({
        featureId: documentId,
        isDirty: false,
        isSaving: false,
        versions,
        currentVersionIndex: Math.max(versions.length - 1, 0),
        isRestoring: false,
        editorMode: "wysiwyg",
      });

      // Fetch current feature detail
      try {
        const res = await fetch(`/api/features?id=${documentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && !Array.isArray(data)) {
            setArtifact((current) => ({
              ...current,
              content: JSON.stringify(data),
            }));
          }
        }
      } catch (e) {
        console.error("[Feature] detail fetch error:", e);
        // Silently fail — content may already be populated via streaming
      }
    },

    onStreamPart: ({ streamPart, setArtifact }) => {
      if (streamPart.type === "data-featureDelta") {
        setArtifact((draftArtifact) => ({
          ...draftArtifact,
          content: streamPart.data as string,
          isVisible: true,
          status: "streaming",
        }));
      }
    },

    content: ({
      content,
      isCurrentVersion,
      onSaveContent,
      isLoading,
      metadata,
      setMetadata,
    }) => {
      if (isLoading || !content) {
        // In browser mode, no content is expected
        if (!metadata?.featureId) {
          return <FeaturesBrowserView setMetadata={setMetadata} />;
        }
        return <DocumentSkeleton artifactKind="text" />;
      }

      // Browser mode
      if (!metadata?.featureId) {
        return <FeaturesBrowserView setMetadata={setMetadata} />;
      }

      // Safety: reject absurdly large content to prevent UI freeze
      if (content.length > 5_000_000) {
        return (
          <div className="p-6 text-sm text-destructive">
            Feature data is too large to display ({(content.length / 1_000_000).toFixed(1)}MB).
            This is likely caused by corrupted ai_metadata. Please contact support.
          </div>
        );
      }

      const versions = metadata?.versions ?? [];
      const currentVersionIndex = metadata?.currentVersionIndex ?? versions.length - 1;
      const isViewingLatest = currentVersionIndex === versions.length - 1 || versions.length === 0;
      // The user can only edit when viewing the latest version
      const canEdit = isCurrentVersion && isViewingLatest;

      let feature: FeatureData;
      try {
        feature = JSON.parse(content);
        // Normalize tags — DB may return a JSON string, comma-separated string, or null
        if (feature.tags && !Array.isArray(feature.tags)) {
          const raw = feature.tags as unknown as string;
          try {
            const parsed = JSON.parse(raw);
            feature.tags = Array.isArray(parsed) ? parsed : [];
          } catch {
            // Handle comma-separated strings like "ui, auth, dashboard"
            feature.tags = typeof raw === "string"
              ? raw.split(",").map((t) => t.trim()).filter(Boolean)
              : [];
          }
        }
        if (!Array.isArray(feature.tags)) {
          feature.tags = [];
        }
      } catch {
        return (
          <div className="p-6 text-sm text-muted-foreground">
            Unable to parse feature data.
          </div>
        );
      }

      const handleFieldChange = (field: string, value: any) => {
        if (!canEdit) return;
        const updated = { ...feature, [field]: value };
        const json = JSON.stringify(updated);
        onSaveContent(json, false);
        setMetadata((prev: FeatureArtifactMetadata) => ({ ...prev, isDirty: true }));
      };

      /**
       * When the user picks a different version in the timeline,
       * fetch its full data from the API and swap the displayed content.
       */
      const handleVersionSelect = async (index: number) => {
        const v = versions[index];
        if (!v) return;

        setMetadata((prev: FeatureArtifactMetadata) => ({
          ...prev,
          currentVersionIndex: index,
        }));

        // If selecting latest, re-fetch current feature data
        if (index === versions.length - 1) {
          try {
            const res = await fetch(
              `/api/features?id=${metadata.featureId}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data && !Array.isArray(data)) {
                onSaveContent(JSON.stringify(data), false);
              }
            }
          } catch {
            // keep existing content
          }
          return;
        }

        // Fetch the full version list and extract the selected version's data
        try {
          const res = await fetch(
            `/api/features?id=${metadata.featureId}&versions=true`
          );
          if (res.ok) {
            const allVersions = await res.json();
            const selected = allVersions.find(
              (fv: any) => fv.version_id === v.version_id
            );
            if (selected) {
              onSaveContent(JSON.stringify(selected), false);
            }
          }
        } catch {
          // keep existing content
        }
      };

      /**
       * Restore the currently viewed version — creates a new version on the server.
       */
      const handleRestore = async () => {
        const v = versions[currentVersionIndex];
        if (!v || !metadata?.featureId) return;

        setMetadata((prev: FeatureArtifactMetadata) => ({
          ...prev,
          isRestoring: true,
        }));

        try {
          const res = await fetch(
            `/api/features?id=${metadata.featureId}&versionId=${v.version_id}`,
            { method: "PUT" }
          );
          if (!res.ok) throw new Error("Failed to restore");

          toast.success("Version restored!");

          // Re-fetch versions & current data
          const versionsRes = await fetch(
            `/api/features?id=${metadata.featureId}&versions=true`
          );
          let newVersions: FeatureVersionSummary[] = [];
          if (versionsRes.ok) {
            const data = await versionsRes.json();
            if (Array.isArray(data)) {
              newVersions = data.map((fv: any) => ({
                version_id: fv.version_id,
                title: fv.title,
                status: fv.status,
                priority: fv.priority,
                valid_from: fv.valid_from,
                valid_to: fv.valid_to,
              }));
            }
          }

          // Fetch the new current feature
          const featureRes = await fetch(
            `/api/features?id=${metadata.featureId}`
          );
          if (featureRes.ok) {
            const featureData = await featureRes.json();
            if (featureData && !Array.isArray(featureData)) {
              onSaveContent(JSON.stringify(featureData), false);
            }
          }

          setMetadata((prev: FeatureArtifactMetadata) => ({
            ...prev,
            versions: newVersions,
            currentVersionIndex: Math.max(newVersions.length - 1, 0),
            isDirty: false,
            isRestoring: false,
          }));
        } catch (error) {
          console.error("Restore error:", error);
          toast.error("Failed to restore version.");
          setMetadata((prev: FeatureArtifactMetadata) => ({
            ...prev,
            isRestoring: false,
          }));
        }
      };

      return (
        <div className="flex flex-col w-full h-full overflow-hidden">
          {/* Version timeline */}
          <VersionTimeline
            versions={versions}
            currentIndex={currentVersionIndex}
            onSelect={handleVersionSelect}
          />

          {/* Restore banner for old versions */}
          {!isViewingLatest && (
            <div className="flex items-center justify-between gap-4 px-6 py-3 border-b bg-amber-50 dark:bg-amber-950/30 text-sm">
              <div>
                <span className="font-medium">
                  Viewing version {currentVersionIndex + 1}
                </span>
                <span className="text-muted-foreground ml-2">
                  — editing is disabled
                </span>
                {versions[currentVersionIndex]?.valid_from && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Last modified: {new Date(versions[currentVersionIndex].valid_from).toLocaleString()}
                    {versions[currentVersionIndex].maintained_by_email && (
                      <span> by {versions[currentVersionIndex].maintained_by_email}</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={metadata?.isRestoring}
                onClick={handleRestore}
                className="shrink-0 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {metadata?.isRestoring ? "Restoring…" : "Restore this version"}
              </button>
            </div>
          )}

          <FeatureDetailView
            feature={feature}
            onFieldChange={handleFieldChange}
            isCurrentVersion={canEdit}
            editorMode={metadata?.editorMode ?? "wysiwyg"}
          />
        </div>
      );
    },

    actions: [
      {
        icon: <CodeIcon size={18} />,
        description: "Toggle raw markdown editor",
        onClick: ({ metadata, setMetadata }) => {
          const current = metadata?.editorMode ?? "wysiwyg";
          setMetadata({
            ...metadata,
            editorMode: current === "wysiwyg" ? "markdown" : "wysiwyg",
          });
        },
        isDisabled: ({ metadata }) => !metadata?.featureId,
      },
      {
        icon: <SaveIcon size={18} />,
        description: "Save feature changes",
        onClick: async ({ content, metadata, setMetadata }) => {
          if (!metadata?.featureId || metadata.featureId === "init") {
            toast.error("No feature loaded to save.");
            return;
          }

          // Block save for old versions
          const versions = metadata.versions ?? [];
          const viewingLatest =
            metadata.currentVersionIndex === versions.length - 1 ||
            versions.length === 0;
          if (!viewingLatest) {
            toast.error("Switch to the current version to save changes.");
            return;
          }

          if (metadata.isSaving) return;
          setMetadata((prev: FeatureArtifactMetadata) => ({ ...prev, isSaving: true }));

          try {
            const data = JSON.parse(content);
            const response = await fetch(
              `/api/features?id=${metadata.featureId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: data.title,
                  description: data.description,
                  status: data.status,
                  priority: data.priority,
                  tags: data.tags,
                  aiMetadata: data.ai_metadata,
                }),
              }
            );

            if (!response.ok) throw new Error("Failed to save");

            // Refresh versions list after save creates a new version
            let newVersions: FeatureVersionSummary[] = versions;
            try {
              const versionsRes = await fetch(
                `/api/features?id=${metadata.featureId}&versions=true`
              );
              if (versionsRes.ok) {
                const vData = await versionsRes.json();
                if (Array.isArray(vData)) {
                  newVersions = vData.map((v: any) => ({
                    version_id: v.version_id,
                    title: v.title,
                    status: v.status,
                    priority: v.priority,
                    valid_from: v.valid_from,
                    valid_to: v.valid_to,
                  }));
                }
              }
            } catch {
              // keep existing versions
            }

            setMetadata((prev: FeatureArtifactMetadata) => ({
              ...prev,
              isDirty: false,
              isSaving: false,
              versions: newVersions,
              currentVersionIndex: Math.max(newVersions.length - 1, 0),
            }));
            toast.success("Feature saved!");
          } catch (error) {
            setMetadata((prev: FeatureArtifactMetadata) => ({ ...prev, isSaving: false }));
            toast.error("Failed to save feature.");
            console.error("Feature save error:", error);
          }
        },
        isDisabled: ({ metadata }) => {
          if (!metadata?.featureId) return true;
          if (metadata?.isSaving) return true;
          // Disable save when viewing an old version
          const versions = metadata?.versions ?? [];
          const viewingLatest =
            metadata?.currentVersionIndex === versions.length - 1 ||
            versions.length === 0;
          return !viewingLatest;
        },
      },
      {
        icon: <CopyIcon size={18} />,
        description: "Copy feature details",
        onClick: ({ content }) => {
          try {
            const f = JSON.parse(content);
            const text = `# ${f.title}\n\nStatus: ${f.status}\nPriority: ${f.priority}\n\n${f.description ?? ""}`;
            navigator.clipboard.writeText(text);
            toast.success("Copied to clipboard!");
          } catch {
            navigator.clipboard.writeText(content);
            toast.success("Copied to clipboard!");
          }
        },
        isDisabled: ({ metadata }) => !metadata?.featureId,
      },
    ],

    toolbar: [
      {
        icon: <SparklesIcon />,
        description: "AI Triage this feature",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Please triage the feature "${artifactTitle}" (ID: ${artifactId}) — use the triageItem tool with itemType "feature" and itemId "${artifactId}".`,
              },
            ],
          });
        },
      },
      {
        icon: <PenIcon />,
        description: "Generate spec from this feature",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Please generate a specification document from the feature "${artifactTitle}" (ID: ${artifactId}) and its sub-features using the generateSpecFromFeature tool.`,
              },
            ],
          });
        },
      },
      {
        icon: <MessageIcon />,
        description: "Suggest improvements",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Review the feature "${artifactTitle}" (ID: ${artifactId}) and suggest improvements to the description, acceptance criteria, or structure.`,
              },
            ],
          });
        },
      },
      {
        icon: <CopyIcon size={16} />,
        description: "Check for duplicates",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Use the detectDuplicates tool to check if the feature "${artifactTitle}" (ID: ${artifactId}) has any potential duplicates. Use itemType "feature" and itemId "${artifactId}".`,
              },
            ],
          });
        },
      },
      {
        icon: <MessageIcon />,
        description: "Analyze impact",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Use the analyzeImpact tool to analyze the impact of the feature "${artifactTitle}" (ID: ${artifactId}). Use itemType "feature" and itemId "${artifactId}".`,
              },
            ],
          });
        },
      },
      {
        icon: <PenIcon />,
        description: "Suggest document links",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Use the suggestDocumentLinks tool to suggest which specification documents are most relevant to the feature "${artifactTitle}" (ID: ${artifactId}). Use itemType "feature" and itemId "${artifactId}".`,
              },
            ],
          });
        },
      },
    ],
  }
);
