"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import { CopyIcon, SparklesIcon } from "@/components/icons";
import useSWR, { mutate as globalMutate } from "swr";
import type { UIArtifact } from "@/components/artifact";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import {
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInDays,
  eachDayOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  isPast,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";

// =============================================================================
// Types
// =============================================================================

type MilestoneStatus = "planning" | "active" | "frozen" | "released" | "archived";
type ReleaseType = "major" | "minor";

interface MilestoneData {
  id: string;
  version_id: string;
  title: string;
  description: string | null;
  version_label: string | null;
  target_date: string | null;
  start_date: string | null;
  status: MilestoneStatus;
  capacity_limit: number | null;
  capacity_unit: string | null;
  tags: string[];
  ai_metadata: Record<string, unknown>;
  maintained_by: string | null;
  repository_id: string | null;
  release_type: ReleaseType;
  release_sequence: number;
  valid_from: string;
  item_count: number;
  done_count: number;
  completion_pct: number;
}

interface MilestoneItemData {
  id: string;
  milestone_id: string;
  item_type: "feature" | "bug" | "capability";
  item_id: string;
  added_at: string;
  item_title?: string;
  item_status?: string;
  item_priority?: string;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  });

// =============================================================================
// Constants
// =============================================================================

const STATUS_CONFIG: Record<MilestoneStatus, { label: string; color: string; bg: string }> = {
  planning: { label: "Planning", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/40" },
  active: { label: "Active", color: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-900/40" },
  frozen: { label: "Frozen", color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-100 dark:bg-purple-900/40" },
  released: { label: "Released", color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-orange-900/40" },
  archived: { label: "Archived", color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-800" },
};

const RELEASE_TYPE_CONFIG: Record<ReleaseType, { label: string; icon: string; color: string; bg: string }> = {
  major: { label: "Major", icon: "🚀", color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-100 dark:bg-indigo-900/40" },
  minor: { label: "Minor", icon: "🔧", color: "text-teal-700 dark:text-teal-300", bg: "bg-teal-100 dark:bg-teal-900/40" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-gray-400",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  done: "text-green-600 dark:text-green-400",
  testing: "text-blue-600 dark:text-blue-400",
  implementation: "text-yellow-600 dark:text-yellow-400",
  spec_generation: "text-purple-600 dark:text-purple-400",
  backlog: "text-gray-500",
  triage: "text-gray-400",
  draft: "text-gray-400",
  active: "text-green-600 dark:text-green-400",
  archived: "text-gray-400",
};

const ITEM_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  capability: { label: "Capability", color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-100 dark:bg-indigo-900/30" },
  feature: { label: "Feature", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/30" },
  bug: { label: "Bug", color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-900/30" },
};

const ALLOWED_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  planning: ["active"],
  active: ["frozen", "planning"],
  frozen: ["released", "active"],
  released: ["archived"],
  archived: [],
};

// =============================================================================
// Small components
// =============================================================================

function StatusBadge({ status }: { status: MilestoneStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bg}`}>
      {config.label}
    </span>
  );
}

function ReleaseTypeBadge({ type }: { type: ReleaseType }) {
  const config = RELEASE_TYPE_CONFIG[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bg}`}>
      {config.icon} {config.label}
    </span>
  );
}

function ItemTypeBadge({ type }: { type: string }) {
  const config = ITEM_TYPE_CONFIG[type] || { label: type, color: "text-gray-600", bg: "bg-gray-100" };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${config.color} ${config.bg}`}>
      {config.label}
    </span>
  );
}

function ProgressBar({ pct, isOverdue }: { pct: number; isOverdue?: boolean }) {
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          pct === 100 ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-blue-500"
        }`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// =============================================================================
// Create Milestone Dialog
// =============================================================================

function CreateMilestoneForm({
  onCreated,
  onCancel,
  defaultReleaseType,
  productId,
}: {
  onCreated: () => void;
  onCancel: () => void;
  defaultReleaseType?: ReleaseType;
  productId?: string;
}) {
  const [title, setTitle] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [capacityLimit, setCapacityLimit] = useState("");
  const [releaseType, setReleaseType] = useState<ReleaseType>(defaultReleaseType || "minor");
  const [releaseSequence, setReleaseSequence] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          versionLabel: versionLabel.trim() || undefined,
          targetDate: targetDate || undefined,
          startDate: startDate || undefined,
          capacityLimit: capacityLimit ? Number.parseInt(capacityLimit, 10) : undefined,
          releaseType,
          releaseSequence: releaseSequence ? Number.parseInt(releaseSequence, 10) : undefined,
          repositoryId: undefined,
          productId: productId || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create milestone");
      toast.success(`${releaseType === "major" ? "Major" : "Minor"} release created`);
      onCreated();
    } catch {
      toast.error("Failed to create milestone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <h3 className="font-semibold text-sm">
        New {releaseType === "major" ? "Major" : "Minor"} Release
      </h3>

      {/* Release type toggle */}
      <div className="flex gap-1 bg-muted rounded-lg p-0.5">
        {(["major", "minor"] as const).map((rt) => (
          <button
            key={rt}
            type="button"
            onClick={() => setReleaseType(rt)}
            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
              releaseType === rt
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {RELEASE_TYPE_CONFIG[rt].icon} {RELEASE_TYPE_CONFIG[rt].label} Release
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            placeholder={releaseType === "major" ? "e.g. v2.0 — Authentication & Reporting" : "e.g. v1.3.1 — Bug fixes & improvements"}
            required
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Version Label</label>
          <input
            type="text"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            placeholder={releaseType === "major" ? "e.g. v2.0" : "e.g. v1.3.1"}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sequence #</label>
          <input
            type="number"
            value={releaseSequence}
            onChange={(e) => setReleaseSequence(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            placeholder="e.g. 1"
            min={1}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Target Date</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Capacity ({releaseType === "major" ? "capabilities" : "items"})</label>
          <input
            type="number"
            value={capacityLimit}
            onChange={(e) => setCapacityLimit(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            placeholder={releaseType === "major" ? "e.g. 3" : "e.g. 15"}
            min={1}
          />
        </div>
        <div className="col-span-1" />
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background min-h-[60px]"
            placeholder={releaseType === "major" ? "Release theme, goals, and key capabilities..." : "Patch scope: bug fixes, enhancements..."}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Creating…" : `Create ${releaseType === "major" ? "Major" : "Minor"} Release`}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Release Calendar Strip
// =============================================================================

type CalendarZoom = "year" | "quarter" | "month" | "week";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ReleaseCalendarStrip({
  milestones,
  onSelect,
}: {
  milestones: MilestoneData[];
  onSelect?: (id: string) => void;
}) {
  const datedMilestones = useMemo(
    () => milestones.filter((m): m is MilestoneData & { target_date: string } => Boolean(m.target_date)),
    [milestones],
  );

  const [zoom, setZoom] = useState<CalendarZoom>("month");
  const [focusDate, setFocusDate] = useState<Date>(() => {
    const active = datedMilestones.find((m) => m.status === "active");
    return active ? parseISO(active.target_date) : new Date();
  });

  if (datedMilestones.length === 0) return null;

  const range = (() => {
    switch (zoom) {
      case "year":
        return { start: startOfYear(focusDate), end: endOfYear(focusDate) };
      case "quarter":
        return { start: startOfQuarter(focusDate), end: endOfQuarter(focusDate) };
      case "week":
        return {
          start: startOfWeek(focusDate, { weekStartsOn: 1 }),
          end: endOfWeek(focusDate, { weekStartsOn: 1 }),
        };
      case "month":
      default:
        return {
          start: startOfWeek(startOfMonth(focusDate), { weekStartsOn: 1 }),
          end: endOfWeek(endOfMonth(focusDate), { weekStartsOn: 1 }),
        };
    }
  })();

  const visibleMilestones = datedMilestones.filter((m) => {
    const d = parseISO(m.target_date);
    return d >= range.start && d <= range.end;
  });

  const moveRange = (direction: -1 | 1) => {
    switch (zoom) {
      case "year":
        setFocusDate((current) => addYears(current, direction));
        break;
      case "quarter":
        setFocusDate((current) => addQuarters(current, direction));
        break;
      case "week":
        setFocusDate((current) => addWeeks(current, direction));
        break;
      case "month":
      default:
        setFocusDate((current) => addMonths(current, direction));
        break;
    }
  };

  const title = (() => {
    switch (zoom) {
      case "year":
        return format(focusDate, "yyyy");
      case "quarter":
        return `Q${Math.floor(focusDate.getMonth() / 3) + 1} ${format(focusDate, "yyyy")}`;
      case "week":
        return `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;
      case "month":
      default:
        return format(focusDate, "MMMM yyyy");
    }
  })();

  const getMilestonesForDay = (day: Date) =>
    visibleMilestones.filter((m) => isSameDay(parseISO(m.target_date), day));

  const renderReleaseChip = (m: MilestoneData, compact = false) => (
    <button
      key={`${m.id}-${compact ? "compact" : "full"}`}
      type="button"
      onClick={() => onSelect?.(m.id)}
      className={`w-full text-left rounded px-1.5 py-1 text-[10px] border transition-colors hover:opacity-90 ${
        m.release_type === "major"
          ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-200 dark:border-indigo-800"
          : "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-200 dark:border-teal-800"
      }`}
      title={`${m.title} — ${m.target_date}`}
    >
      <span className="font-medium truncate block">
        {m.release_type === "major" ? "🚀" : "🔧"} {compact ? (m.version_label || m.title) : m.title}
      </span>
    </button>
  );

  const renderMonthGrid = (monthDate: Date, compact = false) => {
    const monthStart = compact
      ? startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 })
      : range.start;
    const monthEnd = compact
      ? endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 })
      : range.end;
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const limit = compact ? 1 : zoom === "week" ? 4 : 2;

    return (
      <>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="text-[10px] text-muted-foreground text-center font-medium py-1">
              {compact ? label.charAt(0) : label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dayMilestones = getMilestonesForDay(day);
            const dimmed = zoom === "month" && !compact && !isSameMonth(day, focusDate);

            return (
              <div
                key={day.toISOString()}
                className={`rounded-md border p-1.5 ${
                  compact ? "min-h-[56px]" : zoom === "week" ? "min-h-[140px]" : "min-h-[110px]"
                } ${dimmed ? "bg-muted/20 text-muted-foreground/70" : "bg-background"} ${
                  isToday(day) ? "ring-1 ring-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs ${isToday(day) ? "font-bold text-primary" : ""}`}>
                    {format(day, "d")}
                  </span>
                  {dayMilestones.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{dayMilestones.length}</span>
                  )}
                </div>
                {!compact && dayMilestones.length > 0 && (
                  <div className="space-y-1">
                    {dayMilestones.slice(0, limit).map((m) => renderReleaseChip(m, true))}
                    {dayMilestones.length > limit && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayMilestones.length - limit} more</div>
                    )}
                  </div>
                )}
                {compact && dayMilestones.length > 0 && (
                  <div className="mt-1 flex justify-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${dayMilestones.some((m) => m.release_type === "major") ? "bg-indigo-500" : "bg-teal-500"}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Release Calendar</h3>
          <p className="text-xs text-muted-foreground">Navigate your planned releases by year, quarter, month, or week.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-background border rounded-lg p-0.5">
            {(["year", "quarter", "month", "week"] as CalendarZoom[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setZoom(value)}
                className={`px-2.5 py-1 text-xs rounded-md ${zoom === value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveRange(-1)} className="px-2 py-1 text-xs border rounded hover:bg-muted">←</button>
            <button type="button" onClick={() => setFocusDate(new Date())} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">Today</button>
            <button type="button" onClick={() => moveRange(1)} className="px-2 py-1 text-xs border rounded hover:bg-muted">→</button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{visibleMilestones.length} release{visibleMilestones.length === 1 ? "" : "s"} in view</div>
      </div>

      {zoom === "year" || zoom === "quarter" ? (
        <div className={`grid gap-3 ${zoom === "year" ? "md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-3"}`}>
          {Array.from({ length: zoom === "year" ? 12 : 3 }, (_, index) => {
            const monthDate = addMonths(zoom === "year" ? startOfYear(focusDate) : startOfQuarter(focusDate), index);
            const monthMilestones = visibleMilestones.filter((m) => isSameMonth(parseISO(m.target_date), monthDate));

            return (
              <div key={monthDate.toISOString()} className="rounded-lg border bg-background p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">{format(monthDate, "MMM")}</div>
                  <div className="text-[10px] text-muted-foreground">{monthMilestones.length}</div>
                </div>
                {renderMonthGrid(monthDate, true)}
                {monthMilestones.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {monthMilestones.slice(0, 3).map((m) => renderReleaseChip(m, true))}
                    {monthMilestones.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">+{monthMilestones.length - 3} more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border bg-background p-2 overflow-x-auto">
          <div className="min-w-[720px]">
            {renderMonthGrid(focusDate, false)}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Milestone Card
// =============================================================================

function MilestoneCard({
  milestone,
  onSelect,
}: {
  milestone: MilestoneData;
  onSelect: (id: string) => void;
}) {
  const isOverdue = milestone.target_date && isPast(parseISO(milestone.target_date)) && milestone.status !== "released" && milestone.status !== "archived";
  const daysUntil = milestone.target_date ? differenceInDays(parseISO(milestone.target_date), new Date()) : null;
  const isAtRisk = daysUntil !== null && daysUntil > 0 && daysUntil <= 14 && milestone.completion_pct < 80;
  const isOverCapacity = milestone.capacity_limit != null && milestone.item_count > milestone.capacity_limit;
  const isMajor = milestone.release_type === "major";

  return (
    <button
      type="button"
      onClick={() => onSelect(milestone.id)}
      className={`w-full text-left border rounded-lg p-4 hover:bg-muted/50 transition-colors space-y-3 ${
        isMajor ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ReleaseTypeBadge type={milestone.release_type} />
            <h3 className={`font-semibold truncate ${isMajor ? "text-base" : "text-sm"}`}>{milestone.title}</h3>
            {milestone.version_label && (
              <span className="text-xs px-1.5 py-0.5 bg-muted rounded font-mono">{milestone.version_label}</span>
            )}
          </div>
          {milestone.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{milestone.description}</p>
          )}
        </div>
        <StatusBadge status={milestone.status} />
      </div>

      <div className="text-xs text-muted-foreground">
        {isMajor
          ? `${milestone.item_count} ${milestone.item_count === 1 ? "capability" : "capabilities"} planned`
          : `${milestone.item_count} ${milestone.item_count === 1 ? "item" : "items"} (features & fixes)`}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{milestone.done_count}/{milestone.item_count} done</span>
          <span>{milestone.completion_pct}%</span>
        </div>
        <ProgressBar pct={milestone.completion_pct} isOverdue={!!isOverdue} />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {milestone.start_date && <span>{format(parseISO(milestone.start_date), "MMM d")} →</span>}
        {milestone.target_date && (
          <span className={isOverdue ? "text-red-500 font-medium" : ""}>
            {isOverdue ? "Overdue: " : "Due: "}
            {format(parseISO(milestone.target_date), "MMM d, yyyy")}
          </span>
        )}
        {isAtRisk && <span className="text-amber-500 font-medium">⚠ At Risk</span>}
        {isOverCapacity && (
          <span className="text-red-500 font-medium">
            ⚠ Over capacity ({milestone.item_count}/{milestone.capacity_limit})
          </span>
        )}
      </div>
    </button>
  );
}

// =============================================================================
// Milestone Detail View
// =============================================================================

function EditMilestoneForm({
  milestone,
  onSaved,
  onCancel,
}: {
  milestone: MilestoneData;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(milestone.title);
  const [versionLabel, setVersionLabel] = useState(milestone.version_label || "");
  const [description, setDescription] = useState(milestone.description || "");
  const [targetDate, setTargetDate] = useState(milestone.target_date || "");
  const [startDate, setStartDate] = useState(milestone.start_date || "");
  const [capacityLimit, setCapacityLimit] = useState(milestone.capacity_limit?.toString() || "");
  const [releaseType, setReleaseType] = useState<ReleaseType>(milestone.release_type);
  const [releaseSequence, setReleaseSequence] = useState(milestone.release_sequence?.toString() || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          versionLabel: versionLabel.trim() || null,
          targetDate: targetDate || null,
          startDate: startDate || null,
          capacityLimit: capacityLimit ? Number.parseInt(capacityLimit, 10) : null,
          releaseType,
          releaseSequence: releaseSequence ? Number.parseInt(releaseSequence, 10) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update milestone");
      toast.success("Milestone updated");
      globalMutate(`/api/milestones/${milestone.id}`);
      globalMutate("/api/milestones");
      onSaved();
    } catch {
      toast.error("Failed to update milestone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <h3 className="font-semibold text-sm">Edit Release</h3>

      <div className="flex gap-1 bg-muted rounded-lg p-0.5">
        {(["major", "minor"] as const).map((rt) => (
          <button
            key={rt}
            type="button"
            onClick={() => setReleaseType(rt)}
            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
              releaseType === rt
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {RELEASE_TYPE_CONFIG[rt].icon} {RELEASE_TYPE_CONFIG[rt].label} Release
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            required
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Version Label</label>
          <input
            type="text"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sequence #</label>
          <input
            type="number"
            value={releaseSequence}
            onChange={(e) => setReleaseSequence(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            min={1}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Target Date</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Capacity</label>
          <input
            type="number"
            value={capacityLimit}
            onChange={(e) => setCapacityLimit(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background"
            min={1}
          />
        </div>
        <div className="col-span-1" />
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded bg-background min-h-[60px]"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border rounded hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function MilestoneDetail({
  milestoneId,
  onBack,
}: {
  milestoneId: string;
  onBack: () => void;
}) {
  const { data, error, isLoading } = useSWR<MilestoneData & { items: MilestoneItemData[] }>(
    `/api/milestones/${milestoneId}`,
    fetcher,
    { refreshInterval: 5000 }
  );
  const [transitioning, setTransitioning] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleStatusTransition = async (newStatus: MilestoneStatus) => {
    setTransitioning(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Milestone moved to ${newStatus}`);
      globalMutate(`/api/milestones/${milestoneId}`);
      globalMutate("/api/milestones");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setTransitioning(false);
    }
  };

  const handleRemoveItem = async (itemType: string, itemId: string) => {
    try {
      const res = await fetch(`/api/milestones/${milestoneId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", itemType, itemId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Item removed from milestone");
      globalMutate(`/api/milestones/${milestoneId}`);
      globalMutate("/api/milestones");
    } catch {
      toast.error("Failed to remove item");
    }
  };

  if (isLoading) return <DocumentSkeleton artifactKind="text" />;
  if (error || !data) return <div className="p-4 text-red-500">Failed to load milestone</div>;

  const allowedTransitions = ALLOWED_TRANSITIONS[data.status] || [];
  const isOverdue = data.target_date && isPast(parseISO(data.target_date)) && data.status !== "released" && data.status !== "archived";
  const isMajor = data.release_type === "major";
  const canEdit = data.status !== "released" && data.status !== "archived";

  const capabilityItems = data.items?.filter((i) => i.item_type === "capability") || [];
  const featureItems = data.items?.filter((i) => i.item_type === "feature") || [];
  const bugItems = data.items?.filter((i) => i.item_type === "bug") || [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className={`sticky top-0 backdrop-blur border-b px-4 py-3 z-10 ${
        isMajor ? "bg-indigo-50/95 dark:bg-indigo-950/95" : "bg-background/95"
      }`}>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
        >
          ← All Releases
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <ReleaseTypeBadge type={data.release_type} />
              <h2 className="text-lg font-bold">{data.title}</h2>
              {data.version_label && (
                <span className="text-sm px-2 py-0.5 bg-muted rounded font-mono">{data.version_label}</span>
              )}
            </div>
            {data.description && (
              <p className="text-sm text-muted-foreground mt-1">{data.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 text-xs border rounded hover:bg-muted transition-colors"
              >
                ✏️ Edit
              </button>
            )}
            <StatusBadge status={data.status} />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {editing && (
          <EditMilestoneForm
            milestone={data}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {data.start_date && (
            <div>
              <div className="text-xs text-muted-foreground">Start</div>
              <div className="text-sm font-medium">{format(parseISO(data.start_date), "MMM d, yyyy")}</div>
            </div>
          )}
          {data.target_date && (
            <div>
              <div className="text-xs text-muted-foreground">Target</div>
              <div className={`text-sm font-medium ${isOverdue ? "text-red-500" : ""}`}>
                {format(parseISO(data.target_date), "MMM d, yyyy")}
                {isOverdue && " (overdue)"}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground">Progress</div>
            <div className="text-sm font-medium">{data.completion_pct}% ({data.done_count}/{data.item_count})</div>
          </div>
          {data.capacity_limit != null && (
            <div>
              <div className="text-xs text-muted-foreground">Capacity</div>
              <div className={`text-sm font-medium ${data.item_count > data.capacity_limit ? "text-red-500" : ""}`}>
                {data.item_count} / {data.capacity_limit} {isMajor ? "capabilities" : data.capacity_unit}
              </div>
            </div>
          )}
        </div>

        <ProgressBar pct={data.completion_pct} isOverdue={!!isOverdue} />

        {allowedTransitions.length > 0 && (
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground self-center">Transition to:</span>
            {allowedTransitions.map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => handleStatusTransition(next)}
                disabled={transitioning}
                className="px-3 py-1.5 text-xs border rounded hover:bg-muted disabled:opacity-50"
              >
                {STATUS_CONFIG[next].label}
              </button>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          {isMajor ? (
            <>
              <strong>Major release</strong> — assign <em>capabilities</em> to define the scope of new functionality.
              Features within those capabilities will be tracked automatically.
              Use the AI chat to assign capabilities: <code className="bg-muted px-1 rounded">&quot;Add the Authentication capability to this release&quot;</code>
            </>
          ) : (
            <>
              <strong>Minor release</strong> — assign individual <em>features</em> and <em>bug fixes</em> for this patch.
              Use the AI chat to assign items: <code className="bg-muted px-1 rounded">&quot;Add feature X to this release&quot;</code>
            </>
          )}
        </div>

        {isMajor && capabilityItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">●</span>
              Capabilities ({capabilityItems.length})
            </h3>
            <div className="space-y-1">
              {capabilityItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  canRemove={data.status !== "frozen" && data.status !== "released" && data.status !== "archived"}
                  onRemove={() => handleRemoveItem(item.item_type, item.item_id)}
                />
              ))}
            </div>
          </div>
        )}

        {featureItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-blue-600 dark:text-blue-400">●</span>
              Features ({featureItems.length})
            </h3>
            <div className="space-y-1">
              {featureItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  canRemove={data.status !== "frozen" && data.status !== "released" && data.status !== "archived"}
                  onRemove={() => handleRemoveItem(item.item_type, item.item_id)}
                />
              ))}
            </div>
          </div>
        )}

        {bugItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="text-red-600 dark:text-red-400">●</span>
              Bug Fixes ({bugItems.length})
            </h3>
            <div className="space-y-1">
              {bugItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  canRemove={data.status !== "frozen" && data.status !== "released" && data.status !== "archived"}
                  onRemove={() => handleRemoveItem(item.item_type, item.item_id)}
                />
              ))}
            </div>
          </div>
        )}

        {(!data.items || data.items.length === 0) && (
          <p className="text-xs text-muted-foreground py-6 text-center border rounded-lg">
            No items assigned to this release yet.
            <br />
            {isMajor
              ? "Use the AI chat to assign capabilities to this major release."
              : "Use the AI chat to assign features and bug fixes to this minor release."}
          </p>
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  canRemove,
  onRemove,
}: {
  item: MilestoneItemData;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border rounded-lg text-sm hover:bg-muted/30">
      <div className="flex items-center gap-3 min-w-0">
        <ItemTypeBadge type={item.item_type} />
        {item.item_priority && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[item.item_priority] || "bg-gray-400"}`} />
        )}
        <span className="truncate">{item.item_title || item.item_id}</span>
        {item.item_status && (
          <span className={`text-xs flex-shrink-0 ${ITEM_STATUS_COLORS[item.item_status] || "text-gray-400"}`}>
            {item.item_status}
          </span>
        )}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-muted-foreground hover:text-red-500 flex-shrink-0 ml-2"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Main Content Component
// =============================================================================

type ViewTab = "calendar" | "all" | "major" | "minor";

function MilestoneContent({ content }: { content: string }) {
  const { selectedRepositoryId } = useSelectedRepository();
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<MilestoneStatus | "all">("all");
  const [viewTab, setViewTab] = useState<ViewTab>("calendar");

  const repoParam = selectedRepositoryId
    ? `?productId=${selectedRepositoryId}`
    : "";
  const { data: milestones, isLoading, mutate } = useSWR<MilestoneData[]>(
    `/api/milestones${repoParam}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const filteredMilestones = useMemo(() => {
    if (!milestones) return [];
    let list = [...milestones];
    if (viewTab === "major" || viewTab === "minor") {
      list = list.filter((m) => m.release_type === viewTab);
    }
    if (statusFilter !== "all") {
      list = list.filter((m) => m.status === statusFilter);
    }
    list.sort((a, b) => {
      const statusOrder: Record<string, number> = { active: 0, frozen: 1, planning: 2, released: 3, archived: 4 };
      const aDiff = statusOrder[a.status] ?? 5;
      const bDiff = statusOrder[b.status] ?? 5;
      if (aDiff !== bDiff) return aDiff - bDiff;
      if (a.release_sequence !== b.release_sequence) return a.release_sequence - b.release_sequence;
      if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
      if (a.target_date) return -1;
      if (b.target_date) return 1;
      return 0;
    });
    return list;
  }, [milestones, statusFilter, viewTab]);

  const counts = useMemo(() => {
    if (!milestones) return { all: 0, major: 0, minor: 0 };
    return {
      all: milestones.length,
      major: milestones.filter((m) => m.release_type === "major").length,
      minor: milestones.filter((m) => m.release_type === "minor").length,
    };
  }, [milestones]);

  if (selectedMilestoneId) {
    return (
      <MilestoneDetail
        milestoneId={selectedMilestoneId}
        onBack={() => setSelectedMilestoneId(null)}
      />
    );
  }

  if (isLoading) return <DocumentSkeleton artifactKind="text" />;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b px-4 py-3 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Release Planning</h2>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MilestoneStatus | "all")}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              + New Release
            </button>
          </div>
        </div>

        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {([
            { key: "calendar" as const, label: "📅 Calendar" },
            { key: "all" as const, label: `All Releases (${counts.all})` },
            { key: "major" as const, label: `🚀 Major (${counts.major})` },
            { key: "minor" as const, label: `🔧 Minor (${counts.minor})` },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewTab(key)}
              className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewTab === key
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {filteredMilestones.length > 0 && viewTab === "calendar" && (
          <ReleaseCalendarStrip milestones={filteredMilestones} onSelect={setSelectedMilestoneId} />
        )}

        {showCreateForm && (
          <CreateMilestoneForm
            defaultReleaseType={viewTab === "major" || viewTab === "minor" ? viewTab : undefined}
            productId={selectedRepositoryId}
            onCreated={() => {
              setShowCreateForm(false);
              mutate();
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {filteredMilestones.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-3xl mb-2">{viewTab === "calendar" ? "📅" : "📋"}</div>
            <p className="text-sm font-medium">{viewTab === "calendar" ? "No releases on the calendar" : "No releases found"}</p>
            <p className="text-xs mt-1">
              {viewTab === "major"
                ? "Create a major release to plan new capabilities (4× per year)"
                : viewTab === "minor"
                  ? "Create a minor release for bug fixes and enhancements (8× per year)"
                  : "Create your first release to start planning"}
            </p>
          </div>
        ) : viewTab === "calendar" ? null : (
          <div className="space-y-3">
            {filteredMilestones.map((m) => (
              <MilestoneCard key={m.id} milestone={m} onSelect={setSelectedMilestoneId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Artifact Definition
// =============================================================================

export const milestoneArtifact = new Artifact<"milestone", {}>({
  kind: "milestone",
  description: "Release planning with major and minor milestones",

  initialize: () => ({}),

  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "data-milestoneDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data as string,
        status: "idle" as const,
      }));
    }
  },

  content: ({ content, isLoading }) => {
    return <MilestoneContent content={content || "[]"} />;
  },

  actions: [
    {
      icon: <CopyIcon size={18} />,
      description: "Copy release summary",
      onClick: ({ content }) => {
        try {
          const items = JSON.parse(content) as MilestoneData[];
          const majors = items.filter((m) => m.release_type === "major");
          const minors = items.filter((m) => m.release_type === "minor");

          const formatRelease = (m: MilestoneData) =>
            `${m.version_label || m.title} — ${m.status} — ${m.completion_pct}% (${m.done_count}/${m.item_count})${m.target_date ? ` due ${m.target_date}` : ""}`;

          let text = `Release Plan (${items.length} releases)\n\n`;
          if (majors.length) {
            text += `🚀 Major Releases (${majors.length})\n${majors.map(formatRelease).join("\n")}\n\n`;
          }
          if (minors.length) {
            text += `🔧 Minor Releases (${minors.length})\n${minors.map(formatRelease).join("\n")}`;
          }

          navigator.clipboard.writeText(text.trim());
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
      description: "AI Release Planning Analysis",
      immediate: true,
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Analyze the current release plan. Check for: scheduling conflicts between major and minor releases, capacity overcommitment, at-risk milestones approaching their target date, gaps in the release calendar, and whether capabilities are properly distributed across major releases. Suggest improvements to the release cadence.",
            },
          ],
        });
      },
    },
  ],
});
