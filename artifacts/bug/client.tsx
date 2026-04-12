"use client";

import { formatDistance } from "date-fns";
import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  CodeIcon,
  CopyIcon,
  MessageIcon,
  SaveIcon,
  SparklesIcon,
} from "@/components/icons";
import { LinkedDocumentsBadge } from "@/components/linked-items";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { TaskList, TaskCompletionSummary } from "@/components/task-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MilkdownFieldEditor } from "@/components/milkdown-field-editor";

interface BugData {
  id: string;
  title: string;
  description?: string;
  severity?: string;
  status?: string;
  priority?: string;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  environment?: string;
  created_by?: string;
  assigned_to?: string;
  tags?: string[];
  ai_metadata?: Record<string, any>;
  valid_from?: string;
  valid_to?: string;
  maintained_by_email?: string;
}

/** Summary used in the version timeline */
interface BugVersionSummary {
  version_id: string;
  title: string;
  status: string;
  severity: string;
  priority: string;
  valid_from: string;
  valid_to: string;
  maintained_by_email?: string;
}

type BugArtifactMetadata = {
  bugId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  /** All versions for the bug (newest last) */
  versions: BugVersionSummary[];
  /** Index into `versions` currently being viewed */
  currentVersionIndex: number;
  /** True when restoring a version */
  isRestoring: boolean;
  /** Toggle between WYSIWYG (Milkdown) and raw markdown */
  editorMode: "wysiwyg" | "markdown";
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

const severityColors: Record<string, string> = {
  blocker: "bg-red-600 text-white",
  critical: "bg-red-500 text-white",
  major: "bg-orange-500 text-white",
  minor: "bg-yellow-500 text-gray-900",
  trivial: "bg-gray-400 text-white",
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

/** Options for the severity select with colored dot indicators */
const severityOptions = [
  { value: "blocker", label: "Blocker", dot: "bg-red-700" },
  { value: "critical", label: "Critical", dot: "bg-red-500" },
  { value: "major", label: "Major", dot: "bg-orange-500" },
  { value: "minor", label: "Minor", dot: "bg-yellow-500" },
  { value: "trivial", label: "Trivial", dot: "bg-gray-400" },
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

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityColors[severity] ?? "bg-gray-100 text-gray-600"}`}
    >
      {severity}
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
  versions: BugVersionSummary[];
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
 * Bug detail view — displays bug data with structured fields.
 */
function BugDetailView({
  bug,
  onFieldChange,
  isCurrentVersion,
  editorMode = "wysiwyg",
}: {
  bug: BugData;
  onFieldChange: (field: string, value: any) => void;
  isCurrentVersion: boolean;
  editorMode?: "wysiwyg" | "markdown";
}) {
  // environment may come from the API as an object (e.g. {}) — normalise to string
  const envString =
    typeof bug.environment === "string"
      ? bug.environment
      : bug.environment && typeof bug.environment === "object"
        ? Object.keys(bug.environment).length > 0
          ? JSON.stringify(bug.environment)
          : ""
        : "";

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Bug Report
            </span>
            <span className="text-xs text-muted-foreground">
              {bug.id?.slice(0, 8)}
            </span>
          </div>
          {isCurrentVersion ? (
            <input
              className="text-xl font-semibold w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-primary/20 rounded px-1 -ml-1"
              defaultValue={bug.title}
              onBlur={(e) => onFieldChange("title", e.target.value)}
              placeholder="Bug title..."
            />
          ) : (
            <h2 className="text-xl font-semibold">{bug.title}</h2>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {bug.severity && <SeverityBadge severity={bug.severity} />}
          {bug.status && <StatusBadge status={bug.status} />}
          {bug.priority && <PriorityBadge priority={bug.priority} />}
          {bug.id && (
            <TaskCompletionSummary parentType="bug" parentId={bug.id} />
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
              key={`desc-raw-${bug.id}`}
              className="w-full min-h-[80px] p-3 rounded-md border bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/20"
              defaultValue={bug.description ?? ""}
              onChange={(e) => onFieldChange("description", e.target.value)}
              placeholder="Describe this bug..."
            />
          ) : (
            <MilkdownFieldEditor
              key={`desc-${bug.id}`}
              content={bug.description ?? ""}
              onChange={(value) => onFieldChange("description", value)}
              placeholder="Describe this bug..."
              minHeight="80px"
            />
          )
        ) : (
          <p className="text-sm whitespace-pre-wrap p-3 rounded-md border bg-muted/30">
            {bug.description || "No description"}
          </p>
        )}
      </div>

      {/* Reproduce / Expected / Actual */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Steps to Reproduce
          </label>
          {isCurrentVersion ? (
            editorMode === "markdown" ? (
              <textarea
                key={`str-raw-${bug.id}`}
                className="w-full min-h-[80px] p-3 rounded-md border bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/20"
                defaultValue={bug.steps_to_reproduce ?? ""}
                onChange={(e) => onFieldChange("steps_to_reproduce", e.target.value)}
                placeholder="1. Go to ...&#10;2. Click on ...&#10;3. See error"
              />
            ) : (
              <MilkdownFieldEditor
                key={`str-${bug.id}`}
                content={bug.steps_to_reproduce ?? ""}
                onChange={(value) => onFieldChange("steps_to_reproduce", value)}
                placeholder="1. Go to ...\n2. Click on ...\n3. See error"
                minHeight="80px"
              />
            )
          ) : (
            <p className="text-sm whitespace-pre-wrap p-3 rounded-md border bg-muted/30">
              {bug.steps_to_reproduce || "Not specified"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Expected Behavior
            </label>
            {isCurrentVersion ? (
              editorMode === "markdown" ? (
                <textarea
                  key={`exp-raw-${bug.id}`}
                  className="w-full min-h-[60px] p-3 rounded-md border bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/20"
                  defaultValue={bug.expected_behavior ?? ""}
                  onChange={(e) => onFieldChange("expected_behavior", e.target.value)}
                  placeholder="What should happen..."
                />
              ) : (
                <MilkdownFieldEditor
                  key={`exp-${bug.id}`}
                  content={bug.expected_behavior ?? ""}
                  onChange={(value) => onFieldChange("expected_behavior", value)}
                  placeholder="What should happen..."
                  minHeight="60px"
                />
              )
            ) : (
              <p className="text-sm whitespace-pre-wrap p-3 rounded-md border bg-muted/30">
                {bug.expected_behavior || "Not specified"}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Actual Behavior
            </label>
            {isCurrentVersion ? (
              editorMode === "markdown" ? (
                <textarea
                  key={`act-raw-${bug.id}`}
                  className="w-full min-h-[60px] p-3 rounded-md border bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/20"
                  defaultValue={bug.actual_behavior ?? ""}
                  onChange={(e) => onFieldChange("actual_behavior", e.target.value)}
                  placeholder="What actually happens..."
                />
              ) : (
                <MilkdownFieldEditor
                  key={`act-${bug.id}`}
                  content={bug.actual_behavior ?? ""}
                  onChange={(value) => onFieldChange("actual_behavior", value)}
                  placeholder="What actually happens..."
                  minHeight="60px"
                />
              )
            ) : (
              <p className="text-sm whitespace-pre-wrap p-3 rounded-md border bg-muted/30">
                {bug.actual_behavior || "Not specified"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Severity
          </label>
          {isCurrentVersion ? (
            <Select
              defaultValue={bug.severity ?? "major"}
              onValueChange={(value) => onFieldChange("severity", value)}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {severityOptions.map((opt) => (
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
            <p className="text-sm p-2">{bug.severity ?? "major"}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          {isCurrentVersion ? (
            <Select
              defaultValue={bug.status ?? "draft"}
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
              {bug.status?.replace(/_/g, " ") ?? "draft"}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Priority
          </label>
          {isCurrentVersion ? (
            <Select
              defaultValue={bug.priority ?? "medium"}
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
            <p className="text-sm p-2">{bug.priority ?? "medium"}</p>
          )}
        </div>
      </div>

      {/* Environment */}
      {(envString || isCurrentVersion) && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Environment
          </label>
          {isCurrentVersion ? (
            <input
              className="w-full p-3 rounded-md border bg-background text-sm focus:ring-1 focus:ring-primary/20 outline-none"
              defaultValue={envString}
              onBlur={(e) => onFieldChange("environment", e.target.value)}
              placeholder="OS, browser, version, etc."
            />
          ) : (
            <p className="text-sm p-3 rounded-md border bg-muted/30">
              {envString || "Not specified"}
            </p>
          )}
        </div>
      )}

      {/* Tags */}
      {Array.isArray(bug.tags) && bug.tags.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Tags
          </label>
          <div className="flex flex-wrap gap-1.5">
            {bug.tags.map((tag, i) => (
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

      {/* Tasks */}
      {bug.id && (
        <TaskList parentType="bug" parentId={bug.id} />
      )}

      {/* Linked Documents */}
      {bug.id && (
        <LinkedDocumentsBadge itemType="bug" itemId={bug.id} />
      )}

      {/* AI Insights (shared component) */}
      {bug.ai_metadata && (
        <AIInsightsPanel aiMetadata={bug.ai_metadata} />
      )}

      {/* Last modified */}
      {bug.valid_from && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Last modified: {new Date(bug.valid_from).toLocaleString()}
          {bug.maintained_by_email && (
            <span> by {bug.maintained_by_email}</span>
          )}
        </div>
      )}
    </div>
  );
}

export const bugArtifact = new Artifact<"bug", BugArtifactMetadata>({
  kind: "bug",
  description:
    "Bug management artifact — view and edit bug reports with severity, reproduction steps, and AI triage.",

  initialize: async ({ documentId, setMetadata, setArtifact }) => {
    // Fetch versions in parallel with the current bug data
    let versions: BugVersionSummary[] = [];
    try {
      const versionsRes = await fetch(
        `/api/bugs?id=${documentId}&versions=true`
      );
      if (versionsRes.ok) {
        const data = await versionsRes.json();
        if (Array.isArray(data)) {
          versions = data.map((v: any) => ({
            version_id: v.version_id,
            title: v.title,
            status: v.status,
            severity: v.severity,
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
      bugId: documentId,
      isDirty: false,
      isSaving: false,
      versions,
      currentVersionIndex: Math.max(versions.length - 1, 0),
      isRestoring: false,
      editorMode: "wysiwyg",
    });

    // Fetch current bug detail
    try {
      const res = await fetch(`/api/bugs?id=${documentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && !Array.isArray(data)) {
          setArtifact((current) => ({
            ...current,
            content: JSON.stringify(data),
          }));
        }
      }
    } catch {
      // Silently fail — content may already be populated via streaming
    }
  },

  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "data-bugDelta") {
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
      return <DocumentSkeleton artifactKind="text" />;
    }

    const versions = metadata?.versions ?? [];
    const currentVersionIndex = metadata?.currentVersionIndex ?? versions.length - 1;
    const isViewingLatest = currentVersionIndex === versions.length - 1 || versions.length === 0;
    // The user can only edit when viewing the latest version
    const canEdit = isCurrentVersion && isViewingLatest;

    let bug: BugData;
    try {
      bug = JSON.parse(content);
      // Normalize tags — DB may return a JSON string, comma-separated string, or null
      if (bug.tags && !Array.isArray(bug.tags)) {
        const raw = bug.tags as unknown as string;
        try {
          const parsed = JSON.parse(raw);
          bug.tags = Array.isArray(parsed) ? parsed : [];
        } catch {
          bug.tags = typeof raw === "string"
            ? raw.split(",").map((t) => t.trim()).filter(Boolean)
            : [];
        }
      }
      if (!Array.isArray(bug.tags)) {
        bug.tags = [];
      }
    } catch {
      return (
        <div className="p-6 text-sm text-muted-foreground">
          Unable to parse bug data.
        </div>
      );
    }

    const handleFieldChange = (field: string, value: any) => {
      if (!canEdit) return;
      const updated = { ...bug, [field]: value };
      const json = JSON.stringify(updated);
      onSaveContent(json, false);
      setMetadata((prev: BugArtifactMetadata) => ({ ...prev, isDirty: true }));
    };

    /**
     * When the user picks a different version in the timeline,
     * fetch its full data from the API and swap the displayed content.
     */
    const handleVersionSelect = async (index: number) => {
      const v = versions[index];
      if (!v) return;

      setMetadata((prev: BugArtifactMetadata) => ({
        ...prev,
        currentVersionIndex: index,
      }));

      // If selecting latest, re-fetch current bug data
      if (index === versions.length - 1) {
        try {
          const res = await fetch(
            `/api/bugs?id=${metadata.bugId}`
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
          `/api/bugs?id=${metadata.bugId}&versions=true`
        );
        if (res.ok) {
          const allVersions = await res.json();
          const selected = allVersions.find(
            (bv: any) => bv.version_id === v.version_id
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
      if (!v || !metadata?.bugId) return;

      setMetadata((prev: BugArtifactMetadata) => ({
        ...prev,
        isRestoring: true,
      }));

      try {
        const res = await fetch(
          `/api/bugs?id=${metadata.bugId}&versionId=${v.version_id}`,
          { method: "PUT" }
        );
        if (!res.ok) throw new Error("Failed to restore");

        toast.success("Version restored!");

        // Re-fetch versions & current data
        const versionsRes = await fetch(
          `/api/bugs?id=${metadata.bugId}&versions=true`
        );
        let newVersions: BugVersionSummary[] = [];
        if (versionsRes.ok) {
          const data = await versionsRes.json();
          if (Array.isArray(data)) {
            newVersions = data.map((bv: any) => ({
              version_id: bv.version_id,
              title: bv.title,
              status: bv.status,
              severity: bv.severity,
              priority: bv.priority,
              valid_from: bv.valid_from,
              valid_to: bv.valid_to,
            }));
          }
        }

        // Fetch the new current bug
        const bugRes = await fetch(
          `/api/bugs?id=${metadata.bugId}`
        );
        if (bugRes.ok) {
          const bugData = await bugRes.json();
          if (bugData && !Array.isArray(bugData)) {
            onSaveContent(JSON.stringify(bugData), false);
          }
        }

        setMetadata((prev: BugArtifactMetadata) => ({
          ...prev,
          versions: newVersions,
          currentVersionIndex: Math.max(newVersions.length - 1, 0),
          isDirty: false,
          isRestoring: false,
        }));
      } catch (error) {
        console.error("Restore error:", error);
        toast.error("Failed to restore version.");
        setMetadata((prev: BugArtifactMetadata) => ({
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

        <BugDetailView
          bug={bug}
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
    },
    {
      icon: <SaveIcon size={18} />,
      description: "Save bug changes",
      onClick: async ({ content, metadata, setMetadata }) => {
        if (!metadata?.bugId || metadata.bugId === "init") {
          toast.error("No bug loaded to save.");
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
        setMetadata((prev: BugArtifactMetadata) => ({ ...prev, isSaving: true }));

        try {
          const data = JSON.parse(content);
          const response = await fetch(`/api/bugs?id=${metadata.bugId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: data.title,
              description: data.description,
              severity: data.severity,
              status: data.status,
              priority: data.priority,
              stepsToReproduce: data.steps_to_reproduce,
              expectedBehavior: data.expected_behavior,
              actualBehavior: data.actual_behavior,
              environment: data.environment,
              tags: data.tags,
            }),
          });

          if (!response.ok) throw new Error("Failed to save");

          // Refresh versions list after save creates a new version
          let newVersions: BugVersionSummary[] = versions;
          try {
            const versionsRes = await fetch(
              `/api/bugs?id=${metadata.bugId}&versions=true`
            );
            if (versionsRes.ok) {
              const vData = await versionsRes.json();
              if (Array.isArray(vData)) {
                newVersions = vData.map((v: any) => ({
                  version_id: v.version_id,
                  title: v.title,
                  status: v.status,
                  severity: v.severity,
                  priority: v.priority,
                  valid_from: v.valid_from,
                  valid_to: v.valid_to,
                }));
              }
            }
          } catch {
            // keep existing versions
          }

          setMetadata((prev: BugArtifactMetadata) => ({
            ...prev,
            isDirty: false,
            isSaving: false,
            versions: newVersions,
            currentVersionIndex: Math.max(newVersions.length - 1, 0),
          }));
          toast.success("Bug saved!");
        } catch (error) {
          setMetadata((prev: BugArtifactMetadata) => ({ ...prev, isSaving: false }));
          toast.error("Failed to save bug.");
          console.error("Bug save error:", error);
        }
      },
      isDisabled: ({ metadata }) => {
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
      description: "Copy bug details",
      onClick: ({ content }) => {
        try {
          const b = JSON.parse(content);
          const text = `# ${b.title}\n\nSeverity: ${b.severity}\nStatus: ${b.status}\nPriority: ${b.priority}\n\n${b.description ?? ""}\n\nSteps to Reproduce:\n${b.steps_to_reproduce ?? "N/A"}\n\nExpected: ${b.expected_behavior ?? "N/A"}\nActual: ${b.actual_behavior ?? "N/A"}`;
          navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard!");
        } catch {
          navigator.clipboard.writeText(content);
          toast.success("Copied to clipboard!");
        }
      },
    },
  ],

  toolbar: [
    {
      icon: <SparklesIcon />,
      description: "AI Triage this bug",
      immediate: true,
      onClick: ({ sendMessage, artifactId, artifactTitle }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: `Please triage the bug "${artifactTitle}" (ID: ${artifactId}) — use the triageItem tool with itemType "bug" and itemId "${artifactId}".`,
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Suggest fix approach",
      immediate: true,
      onClick: ({ sendMessage, artifactId, artifactTitle }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: `Analyze the bug "${artifactTitle}" (ID: ${artifactId}) and suggest a technical approach for fixing it.`,
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
              text: `Use the detectDuplicates tool to check if the bug "${artifactTitle}" (ID: ${artifactId}) has any potential duplicates. Use itemType "bug" and itemId "${artifactId}".`,
            },
          ],
        });
      },
    },
    {
      icon: <SparklesIcon />,
      description: "Analyze impact",
      immediate: true,
      onClick: ({ sendMessage, artifactId, artifactTitle }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: `Use the analyzeImpact tool to analyze the impact of the bug "${artifactTitle}" (ID: ${artifactId}). Use itemType "bug" and itemId "${artifactId}".`,
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Suggest document links",
      immediate: true,
      onClick: ({ sendMessage, artifactId, artifactTitle }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: `Use the suggestDocumentLinks tool to suggest which specification documents are most relevant to the bug "${artifactTitle}" (ID: ${artifactId}). Use itemType "bug" and itemId "${artifactId}".`,
            },
          ],
        });
      },
    },
  ],
});
