"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import { CopyIcon, SparklesIcon } from "@/components/icons";
import { useArtifactStack } from "@/hooks/use-artifact";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useSWR from "swr";
import type { UIArtifact } from "@/components/artifact";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInDays,
  differenceInWeeks,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  endOfMonth,
  endOfQuarter,
  addQuarters,
  isWithinInterval,
  max as dateMax,
  min as dateMin,
  parseISO,
  isBefore,
  isAfter,
} from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// =============================================================================
// TYPES
// =============================================================================

interface RoadmapItemData {
  id: string;
  version_id: string;
  title: string;
  feature_type: string;
  status: string;
  priority: string;
  effort_estimate: string | null;
  planned_start: string | null;
  planned_end: string | null;
  roadmap_horizon: "now" | "next" | "later" | null;
  parent_id: string | null;
  primary_capability_id: string | null;
  capability_name: string | null;
  capability_id: string | null;
  task_total: number;
  task_done: number;
  repository_id: string;
  milestone_id: string | null;
  milestone_title: string | null;
  milestone_version_label: string | null;
  milestone_release_type: "major" | "minor" | null;
  milestone_target_date: string | null;
}

interface MilestoneOverlay {
  id: string;
  title: string;
  version_label: string | null;
  status: string;
  release_type: "major" | "minor";
  start_date: string | null;
  target_date: string | null;
  completion_pct: number;
  item_count: number;
  done_count: number;
}

type RoadmapArtifactMetadata = {
  isRefreshing: boolean;
};

interface CapabilityData {
  id: string;
  name: string;
  sdlc_phase: string;
  sort_order: number;
  status: string;
  priority: string | null;
  planned_start: string | null;
  planned_end: string | null;
  roadmap_horizon: "now" | "next" | "later" | null;
  feature_count: number;
  bug_count: number;
  task_count: number;
  milestone_id: string | null;
  milestone_title: string | null;
  milestone_version_label: string | null;
  milestone_release_type: "major" | "minor" | null;
  milestone_target_date: string | null;
}

type ZoomLevel = "quarterly" | "monthly" | "weekly";
type ViewMode = "timeline" | "kanban";
type ColorBy = "status" | "priority" | "capability";

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-300 dark:bg-gray-600",
  triage: "bg-yellow-300 dark:bg-yellow-700",
  backlog: "bg-blue-300 dark:bg-blue-700",
  spec_generation: "bg-purple-300 dark:bg-purple-700",
  implementation: "bg-orange-300 dark:bg-orange-700",
  testing: "bg-cyan-300 dark:bg-cyan-700",
  done: "bg-green-300 dark:bg-green-700",
  rejected: "bg-red-300 dark:bg-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-400 dark:bg-red-700",
  high: "bg-orange-400 dark:bg-orange-700",
  medium: "bg-yellow-300 dark:bg-yellow-700",
  low: "bg-green-300 dark:bg-green-700",
};

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  high: { label: "High", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  medium: { label: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  low: { label: "Low", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

const CAPABILITY_COLORS = [
  "bg-blue-400 dark:bg-blue-600",
  "bg-purple-400 dark:bg-purple-600",
  "bg-teal-400 dark:bg-teal-600",
  "bg-pink-400 dark:bg-pink-600",
  "bg-indigo-400 dark:bg-indigo-600",
  "bg-amber-400 dark:bg-amber-600",
  "bg-rose-400 dark:bg-rose-600",
  "bg-emerald-400 dark:bg-emerald-600",
];

const HORIZON_LABELS: Record<string, { title: string; description: string }> = {
  now: { title: "Now", description: "Current sprint / in-flight" },
  next: { title: "Next", description: "1–2 releases ahead" },
  later: { title: "Later", description: "Future / exploratory" },
  unplanned: { title: "Unplanned", description: "Not yet planned" },
};

const MILESTONE_COLORS = {
  major: {
    bg: "bg-indigo-200/40 dark:bg-indigo-800/30",
    border: "border-indigo-300 dark:border-indigo-700",
    line: "bg-indigo-400 dark:bg-indigo-600",
    text: "text-indigo-700 dark:text-indigo-300",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  },
  minor: {
    bg: "bg-teal-200/40 dark:bg-teal-800/30",
    border: "border-teal-300 dark:border-teal-700",
    line: "bg-teal-400 dark:bg-teal-600",
    text: "text-teal-700 dark:text-teal-300",
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getProgressPercent(item: RoadmapItemData): number | null {
  if (item.task_total === 0) return null;
  return Math.round((item.task_done / item.task_total) * 100);
}

function getColorForItem(item: RoadmapItemData, colorBy: ColorBy, capabilityColorMap: Map<string, string>): string {
  switch (colorBy) {
    case "status":
      return STATUS_COLORS[item.status] ?? "bg-gray-300 dark:bg-gray-600";
    case "priority":
      return PRIORITY_COLORS[item.priority] ?? "bg-gray-300 dark:bg-gray-600";
    case "capability":
      return capabilityColorMap.get(item.primary_capability_id ?? item.capability_id ?? "") ?? "bg-gray-300 dark:bg-gray-600";
  }
}

// =============================================================================
// TIMELINE VIEW COMPONENTS
// =============================================================================

function TimelineControlBar({
  zoom,
  setZoom,
  colorBy,
  setColorBy,
}: {
  zoom: ZoomLevel;
  setZoom: (z: ZoomLevel) => void;
  colorBy: ColorBy;
  setColorBy: (c: ColorBy) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Zoom:</span>
        {(["quarterly", "monthly", "weekly"] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
              zoom === z
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted-foreground/10 text-muted-foreground"
            }`}
          >
            {z === "quarterly" ? "Q" : z === "monthly" ? "M" : "W"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Color:</span>
        {(["status", "priority", "capability"] as ColorBy[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColorBy(c)}
            className={`px-2 py-0.5 text-xs rounded-md capitalize transition-colors ${
              colorBy === c
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted-foreground/10 text-muted-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// Draggable timeline bar supporting move and edge-resize
function DraggableTimelineBar({
  item,
  barColor,
  leftPercent,
  widthPercent,
  totalDays,
  timelineStart,
  onItemClick,
  onScheduleChange,
}: {
  item: RoadmapItemData;
  barColor: string;
  leftPercent: number;
  widthPercent: number;
  totalDays: number;
  timelineStart: Date;
  onItemClick?: (item: RoadmapItemData) => void;
  onScheduleChange?: (itemId: string, plannedStart: string, plannedEnd: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    mode: "move" | "resize-end";
    startX: number;
    origLeftPct: number;
    origWidthPct: number;
  } | null>(null);
  const [localLeft, setLocalLeft] = useState(leftPercent);
  const [localWidth, setLocalWidth] = useState(widthPercent);
  const didDragRef = useRef(false);

  // Sync from props when not dragging
  useEffect(() => {
    if (!dragState) {
      setLocalLeft(leftPercent);
      setLocalWidth(widthPercent);
    }
  }, [leftPercent, widthPercent, dragState]);

  const progress = getProgressPercent(item);

  const onMouseDown = useCallback(
    (e: React.MouseEvent, mode: "move" | "resize-end") => {
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
      setDragState({
        mode,
        startX: e.clientX,
        origLeftPct: localLeft,
        origWidthPct: localWidth,
      });
    },
    [localLeft, localWidth],
  );

  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e: MouseEvent) => {
      const container = barRef.current?.parentElement;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      const dx = e.clientX - dragState.startX;
      const deltaPct = (dx / containerWidth) * 100;

      if (Math.abs(dx) > 3) didDragRef.current = true;

      if (dragState.mode === "move") {
        setLocalLeft(Math.max(0, dragState.origLeftPct + deltaPct));
      } else {
        setLocalWidth(Math.max(2, dragState.origWidthPct + deltaPct));
      }
    };

    const onMouseUp = () => {
      if (!didDragRef.current || !item.planned_start || !item.planned_end) {
        setDragState(null);
        return;
      }

      const origStart = parseISO(item.planned_start);
      const origEnd = parseISO(item.planned_end);

      if (dragState.mode === "move") {
        const dayShift = Math.round(((localLeft - dragState.origLeftPct) / 100) * totalDays);
        const newStart = addDays(origStart, dayShift);
        const newEnd = addDays(origEnd, dayShift);
        onScheduleChange?.(item.id, format(newStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"));
      } else {
        const dayShift = Math.round(((localWidth - dragState.origWidthPct) / 100) * totalDays);
        const newEnd = addDays(origEnd, dayShift);
        if (!isBefore(newEnd, origStart)) {
          onScheduleChange?.(item.id, format(origStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"));
        }
      }

      setDragState(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, localLeft, localWidth, totalDays, item, onScheduleChange]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={barRef}
            className={`absolute top-1 h-5 rounded-sm ${barColor} ${
              dragState ? "opacity-100 ring-2 ring-primary shadow-lg" : "opacity-80 hover:opacity-100"
            } transition-opacity cursor-grab active:cursor-grabbing flex items-center px-1.5 overflow-hidden select-none`}
            style={{
              left: `${localLeft}%`,
              width: `${localWidth}%`,
              minWidth: "24px",
            }}
            onMouseDown={(e) => onMouseDown(e, "move")}
            onClick={(e) => {
              if (!didDragRef.current) onItemClick?.(item);
            }}
          >
            {progress !== null && (
              <div
                className="absolute inset-0 bg-white/20 dark:bg-black/20"
                style={{ width: `${progress}%` }}
              />
            )}
            <span className="relative text-[10px] font-medium text-white dark:text-white truncate drop-shadow-sm">
              {progress !== null ? `${progress}%` : ""}
            </span>
            {/* Resize handle on right edge */}
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
              onMouseDown={(e) => onMouseDown(e, "resize-end")}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div className="font-medium">{item.title}</div>
            {item.planned_start && item.planned_end && (
              <div>{format(parseISO(item.planned_start), "MMM d")} → {format(parseISO(item.planned_end), "MMM d, yyyy")}</div>
            )}
            <div className="capitalize">Status: {item.status.replace("_", " ")}</div>
            <div className="capitalize">Priority: {item.priority}</div>
            {progress !== null && <div>Progress: {progress}%</div>}
            {item.capability_name && <div>Capability: {item.capability_name}</div>}
            <div className="text-muted-foreground mt-0.5">Drag to move • Drag right edge to resize</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TimelineView({
  items,
  zoom,
  colorBy,
  capabilityColorMap,
  milestones,
  onItemClick,
  onCapabilityClick,
  onScheduleChange,
}: {
  items: RoadmapItemData[];
  zoom: ZoomLevel;
  colorBy: ColorBy;
  capabilityColorMap: Map<string, string>;
  milestones: MilestoneOverlay[];
  onItemClick?: (item: RoadmapItemData) => void;
  onCapabilityClick?: (capId: string, capName: string) => void;
  onScheduleChange?: (itemId: string, plannedStart: string, plannedEnd: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculate timeline range from items or use default
  const { timelineStart, timelineEnd, periods } = useMemo(() => {
    const now = new Date();
    let minDate = now;
    let maxDate = addMonths(now, 12);

    for (const item of items) {
      if (item.planned_start) {
        const d = parseISO(item.planned_start);
        if (isBefore(d, minDate)) minDate = d;
      }
      if (item.planned_end) {
        const d = parseISO(item.planned_end);
        if (isAfter(d, maxDate)) maxDate = d;
      }
    }

    // Add padding
    const start = zoom === "quarterly" ? startOfQuarter(minDate) : zoom === "monthly" ? startOfMonth(minDate) : startOfWeek(minDate);
    const end = zoom === "quarterly" ? addQuarters(endOfQuarter(maxDate), 1) : zoom === "monthly" ? addMonths(endOfMonth(maxDate), 1) : addWeeks(maxDate, 2);

    // Generate period markers
    const periods: { label: string; start: Date; width: number }[] = [];
    let cursor = start;
    const totalDays = differenceInDays(end, start) || 1;

    while (isBefore(cursor, end)) {
      let periodEnd: Date;
      let label: string;

      if (zoom === "quarterly") {
        periodEnd = addQuarters(cursor, 1);
        const q = Math.ceil((cursor.getMonth() + 1) / 3);
        label = `Q${q} ${cursor.getFullYear()}`;
      } else if (zoom === "monthly") {
        periodEnd = addMonths(cursor, 1);
        label = format(cursor, "MMM yyyy");
      } else {
        periodEnd = addWeeks(cursor, 1);
        label = `W${format(cursor, "w")} ${format(cursor, "MMM")}`;
      }

      const days = differenceInDays(dateMin([periodEnd, end]), cursor);
      periods.push({ label, start: cursor, width: (days / totalDays) * 100 });
      cursor = periodEnd;
    }

    return { timelineStart: start, timelineEnd: end, periods };
  }, [items, zoom]);

  const totalDays = differenceInDays(timelineEnd, timelineStart) || 1;

  // Group items by capability
  const grouped = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; items: RoadmapItemData[] }>();
    const ungrouped: RoadmapItemData[] = [];

    for (const item of items) {
      if (item.capability_id && item.capability_name) {
        if (!groups.has(item.capability_id)) {
          groups.set(item.capability_id, { id: item.capability_id, name: item.capability_name, items: [] });
        }
        groups.get(item.capability_id)!.items.push(item);
      } else {
        ungrouped.push(item);
      }
    }

    const result: { id: string | null; name: string | null; items: RoadmapItemData[] }[] = [];
    for (const [, group] of groups) {
      result.push(group);
    }
    if (ungrouped.length > 0) {
      result.push({ id: null, name: null, items: ungrouped });
    }
    return result;
  }, [items]);

  // Items with dates for timeline, items without for the "unscheduled" section
  const scheduledItems = items.filter((i) => i.planned_start && i.planned_end);
  const unscheduledItems = items.filter((i) => !i.planned_start || !i.planned_end);

  const pixelsPerDay = zoom === "quarterly" ? 3 : zoom === "monthly" ? 6 : 12;
  const totalWidth = totalDays * pixelsPerDay;

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto">
        <div style={{ minWidth: `${Math.max(totalWidth, 800)}px` }}>
          {/* Period headers */}
          <div className="flex border-b border-border sticky top-0 bg-background z-10">
            <div className="w-48 min-w-48 border-r border-border px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Feature
            </div>
            <div className="flex-1 flex">
              {periods.map((p, i) => (
                <div
                  key={i}
                  style={{ width: `${p.width}%` }}
                  className="border-r border-border/50 px-1.5 py-1.5 text-xs text-muted-foreground font-medium truncate"
                >
                  {p.label}
                </div>
              ))}
            </div>
          </div>

          {/* Today marker */}
          {(() => {
            const now = new Date();
            if (isBefore(now, timelineStart) || isAfter(now, timelineEnd)) return null;
            const offset = (differenceInDays(now, timelineStart) / totalDays) * 100;
            return (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500/60 z-20 pointer-events-none"
                style={{ left: `calc(12rem + ${offset}%)` }}
              />
            );
          })()}

          {/* Milestone markers */}
          {milestones.filter((ms) => ms.target_date && ms.status !== "archived").map((ms) => {
            const msColors = MILESTONE_COLORS[ms.release_type] || MILESTONE_COLORS.minor;
            const targetDate = parseISO(ms.target_date!);
            if (isBefore(targetDate, timelineStart) || isAfter(targetDate, timelineEnd)) return null;
            const targetOffset = (differenceInDays(targetDate, timelineStart) / totalDays) * 100;

            // If milestone has a start_date, render a band; otherwise just a marker line
            const hasRange = ms.start_date && !isAfter(parseISO(ms.start_date), targetDate);
            let rangeLeftPct = 0;
            let rangeWidthPct = 0;
            if (hasRange) {
              const sd = dateMax([parseISO(ms.start_date!), timelineStart]);
              const ed = dateMin([targetDate, timelineEnd]);
              rangeLeftPct = Math.max(0, (differenceInDays(sd, timelineStart) / totalDays) * 100);
              rangeWidthPct = Math.max(0.5, (differenceInDays(ed, sd) / totalDays) * 100);
            }

            return (
              <div key={ms.id} className="relative" style={{ height: 0 }}>
                {/* Range band */}
                {hasRange && (
                  <div
                    className={`absolute top-0 bottom-0 ${msColors.bg} border-y ${msColors.border} pointer-events-none z-[5]`}
                    style={{
                      left: `calc(12rem + ${rangeLeftPct}%)`,
                      width: `${rangeWidthPct}%`,
                      height: "100%",
                      position: "absolute",
                    }}
                  />
                )}
                {/* Target date diamond marker */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`absolute z-[15] pointer-events-auto cursor-default`}
                        style={{
                          left: `calc(12rem + ${targetOffset}% - 8px)`,
                          top: "-2px",
                        }}
                      >
                        <div className={`w-4 h-4 rotate-45 ${ms.release_type === "major" ? "bg-indigo-500" : "bg-teal-500"} border-2 border-white dark:border-gray-900 shadow-sm`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs space-y-0.5">
                        <div className="font-medium">{ms.release_type === "major" ? "🚀" : "🔧"} {ms.version_label || ms.title}</div>
                        <div>Target: {format(targetDate, "MMM d, yyyy")}</div>
                        <div>Progress: {ms.completion_pct}% ({ms.done_count}/{ms.item_count})</div>
                        <div className="capitalize">Status: {ms.status}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Vertical marker line */}
                <div
                  className={`absolute top-0 w-px ${msColors.line} z-[6] pointer-events-none`}
                  style={{
                    left: `calc(12rem + ${targetOffset}%)`,
                    height: "9999px",
                    opacity: 0.5,
                  }}
                />
                {/* Label at top */}
                <div
                  className={`absolute z-[16] text-[9px] font-semibold ${msColors.text} whitespace-nowrap pointer-events-none`}
                  style={{
                    left: `calc(12rem + ${targetOffset}% + 4px)`,
                    top: "-1px",
                  }}
                >
                  {ms.release_type === "major" ? "🚀" : "🔧"} {ms.version_label || ms.title}
                </div>
              </div>
            );
          })}

          {/* Grouped rows */}
          {grouped.map((group, gi) => (
            <div key={gi}>
              {group.name && group.id && (
                <div className="flex border-b border-border/50 bg-muted/20">
                  <div className="w-48 min-w-48 border-r border-border px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <span>🧩</span>
                    <button
                      type="button"
                      onClick={() => onCapabilityClick?.(group.id!, group.name!)}
                      className="hover:underline text-left truncate"
                    >
                      {group.name}
                    </button>
                  </div>
                  <div className="flex-1" />
                </div>
              )}
              {group.items.map((item) => {
                const barColor = getColorForItem(item, colorBy, capabilityColorMap);
                let leftPercent = 0;
                let widthPercent = 5;

                if (item.planned_start && item.planned_end) {
                  const s = parseISO(item.planned_start);
                  const e = parseISO(item.planned_end);
                  leftPercent = Math.max(0, (differenceInDays(s, timelineStart) / totalDays) * 100);
                  widthPercent = Math.max(2, (differenceInDays(e, s) / totalDays) * 100);
                }

                return (
                  <div
                    key={item.id}
                    className="flex border-b border-border/30 hover:bg-muted/10 group"
                  >
                    <div className="w-48 min-w-48 border-r border-border px-2 py-1.5 text-xs truncate flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onItemClick?.(item)}
                        className="truncate hover:underline text-left"
                        title={item.title}
                      >
                        {item.title}
                      </button>
                    </div>
                    <div className="flex-1 relative py-1">
                      {item.planned_start && item.planned_end ? (
                        <DraggableTimelineBar
                          item={item}
                          barColor={barColor}
                          leftPercent={leftPercent}
                          widthPercent={widthPercent}
                          totalDays={totalDays}
                          timelineStart={timelineStart}
                          onItemClick={onItemClick}
                          onScheduleChange={onScheduleChange}
                        />
                      ) : (
                        <div className="px-2 py-0.5 text-xs text-muted-foreground/50 italic">
                          Unscheduled
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Unscheduled items footer */}
      {unscheduledItems.length > 0 && (
        <div className="border-t border-border bg-muted/10 px-4 py-2">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Unscheduled ({unscheduledItems.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {unscheduledItems.slice(0, 10).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onItemClick?.(item)}
                className="text-xs px-2 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 truncate max-w-40"
                title={item.title}
              >
                {item.title}
              </button>
            ))}
            {unscheduledItems.length > 10 && (
              <span className="text-xs text-muted-foreground">+{unscheduledItems.length - 10} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// KANBAN VIEW COMPONENTS
// =============================================================================

/** Unified item type for kanban — either a capability or a feature/bug */
type KanbanItem =
  | { kind: "capability"; data: CapabilityData; features: RoadmapItemData[] }
  | { kind: "feature"; data: RoadmapItemData };

function CapabilityKanbanCard({
  cap,
  allFeatures,
  laneId,
  onFeatureClick,
  onCapabilityClick,
  onFeaturePhaseToggle,
}: {
  cap: CapabilityData;
  allFeatures: RoadmapItemData[];
  laneId: string;
  onFeatureClick?: (item: RoadmapItemData) => void;
  onCapabilityClick?: (cap: CapabilityData) => void;
  onFeaturePhaseToggle?: (featureId: string, milestoneId: string | null, assign: boolean) => void;
}) {
  const [otherPhasesOpen, setOtherPhasesOpen] = useState(false);
  const [thisPhasesOpen, setThisPhasesOpen] = useState(true);

  const badge = cap.priority ? PRIORITY_BADGES[cap.priority] : null;
  const totalFeatures = cap.feature_count;

  // Split features into "this phase" and "other phases"
  const isUnplannedLane = laneId === "unplanned";
  const thisPhaseFeatures = isUnplannedLane
    ? allFeatures.filter((f) => !f.milestone_id)
    : allFeatures.filter((f) => f.milestone_id === laneId);
  const otherPhaseFeatures = isUnplannedLane
    ? allFeatures.filter((f) => f.milestone_id)
    : allFeatures.filter((f) => f.milestone_id !== laneId && f.milestone_id);
  const unplannedFeatures = isUnplannedLane
    ? []
    : allFeatures.filter((f) => !f.milestone_id);

  // Selectable features = this phase + unplanned (in milestone lanes)
  const selectableFeatures = [...thisPhaseFeatures, ...unplannedFeatures];
  const doneFeatures = allFeatures.filter((f) => f.status === "done").length;

  return (
    <div className="w-full text-left rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 transition-all hover:shadow-md">
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs">🧩</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCapabilityClick?.(cap); }}
            className="text-sm font-semibold line-clamp-2 text-left hover:underline"
          >
            {cap.name}
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
              {badge.label}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 font-medium capitalize">
            {cap.sdlc_phase.replace("_", " ")}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            {totalFeatures} feature{totalFeatures !== 1 ? "s" : ""}
          </span>
        </div>
        {totalFeatures > 0 && (
          <div className="mt-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>Features</span>
              <span>{doneFeatures}/{totalFeatures}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  doneFeatures === totalFeatures ? "bg-green-500" : "bg-blue-500"
                }`}
                style={{ width: `${totalFeatures > 0 ? (doneFeatures / totalFeatures) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Other Phases — read-only, collapsible */}
      {otherPhaseFeatures.length > 0 && (
        <div className="border-t border-blue-200/50 dark:border-blue-800/50">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOtherPhasesOpen(!otherPhasesOpen); }}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
          >
            <span className="text-[9px]">{otherPhasesOpen ? "▾" : "▸"}</span>
            <span>Planned in Other Phases</span>
            <span className="text-[9px] opacity-60">({otherPhaseFeatures.length})</span>
          </button>
          {otherPhasesOpen && (
            <div className="px-2 pb-1.5 space-y-1">
              {otherPhaseFeatures.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onFeatureClick?.(f); }}
                  className="w-full text-left text-xs px-2 py-1 rounded bg-muted/40 border border-border/30 flex items-center gap-1.5 transition-colors opacity-60 hover:opacity-80"
                  title={`${f.title} — ${f.milestone_version_label || f.milestone_title || "planned"}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[f.status] || "bg-gray-300"}`} />
                  <span className="truncate">{f.title}</span>
                  {f.milestone_version_label && (
                    <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-auto">{f.milestone_version_label}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* This Phase — selectable with checkmarks (in milestone lanes) */}
      {selectableFeatures.length > 0 && (
        <div className="border-t border-blue-200/50 dark:border-blue-800/50">
          {!isUnplannedLane && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setThisPhasesOpen(!thisPhasesOpen); }}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
            >
              <span className="text-[9px]">{thisPhasesOpen ? "▾" : "▸"}</span>
              <span>This Phase</span>
              <span className="text-[9px] opacity-60">({thisPhaseFeatures.length} planned{unplannedFeatures.length > 0 ? `, ${unplannedFeatures.length} available` : ""})</span>
            </button>
          )}
          {(isUnplannedLane || thisPhasesOpen) && (
            <div className="px-2 pb-1.5 space-y-1">
              {selectableFeatures.map((f) => {
                const isPlanned = !!f.milestone_id && f.milestone_id === laneId;
                return (
                  <div key={f.id} className="flex items-center gap-1">
                    {!isUnplannedLane && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFeaturePhaseToggle?.(f.id, laneId, !isPlanned);
                        }}
                        className={`flex-shrink-0 w-3.5 h-3.5 rounded border transition-colors flex items-center justify-center ${
                          isPlanned
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "border-border hover:border-blue-400"
                        }`}
                        title={isPlanned ? "Remove from this phase" : "Add to this phase"}
                      >
                        {isPlanned && (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onFeatureClick?.(f); }}
                      className="flex-1 min-w-0 text-left text-xs px-2 py-1 rounded bg-card/80 hover:bg-accent/50 border border-border/50 flex items-center gap-1.5 transition-colors"
                      title={f.title}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[f.status] || "bg-gray-300"}`} />
                      <span className="truncate">{f.title}</span>
                      {f.priority === "critical" && <span className="text-[9px] text-red-500 flex-shrink-0">●</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeatureKanbanCard({
  item,
}: {
  item: RoadmapItemData;
}) {
  const progress = getProgressPercent(item);
  const badge = PRIORITY_BADGES[item.priority];
  const isAtRisk = item.status === "blocked" || (progress !== null && progress < 30 && item.status === "implementation");

  return (
    <div
      className={`w-full text-left p-2.5 rounded-lg border transition-all hover:shadow-md text-xs ${
        isAtRisk
          ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20"
          : "border-border bg-card hover:bg-accent/50"
      }`}
    >
      <div className="text-xs font-medium mb-1 line-clamp-2">{item.title}</div>
      <div className="flex items-center gap-1 flex-wrap">
        {badge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
          {item.status.replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

function SortableKanbanItem({
  itemId,
  itemType,
  children,
  onClick,
}: {
  itemId: string;
  itemType: "capability" | "feature";
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId, data: { type: itemType } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: "none" }}
      {...attributes}
      {...listeners}
      onClick={() => { if (!isDragging && onClick) onClick(); }}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

function KanbanLane({
  laneId,
  title,
  description,
  accent,
  capEntries,
  orphanFeatures,
  onItemClick,
  onCapabilityClick,
  onFeaturePhaseToggle,
}: {
  laneId: string;
  title: string;
  description: string;
  accent?: string;
  capEntries: { cap: CapabilityData; features: RoadmapItemData[] }[];
  orphanFeatures: RoadmapItemData[];
  onItemClick?: (item: RoadmapItemData) => void;
  onCapabilityClick?: (cap: CapabilityData) => void;
  onFeaturePhaseToggle?: (featureId: string, milestoneId: string | null, assign: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${laneId}` });
  const totalItems = capEntries.length + orphanFeatures.length;

  // All draggable IDs: capability IDs scoped to lane to handle multi-lane presence
  const allIds = [
    ...capEntries.map((e) => `cap-${e.cap.id}-${laneId}`),
    ...orphanFeatures.map((f) => f.id),
  ];

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-72 flex flex-col rounded-lg border border-border overflow-hidden transition-colors ${
        isOver ? "bg-primary/5 border-primary/30" : "bg-muted/20"
      }`}
    >
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              {accent && <div className={`w-2.5 h-2.5 rounded-sm ${accent}`} />}
              <div className="text-sm font-semibold">{title}</div>
            </div>
            <div className="text-[10px] text-muted-foreground">{description}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{totalItems}</span>
          </div>
        </div>
      </div>
      <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
          {totalItems === 0 ? (
            <div className="text-xs text-muted-foreground/50 text-center py-8 italic">
              Drag capabilities or features here
            </div>
          ) : (
            <>
              {capEntries.map(({ cap, features }) => (
                <SortableKanbanItem
                  key={`cap-${cap.id}-${laneId}`}
                  itemId={`cap-${cap.id}-${laneId}`}
                  itemType="capability"
                >
                  <CapabilityKanbanCard
                    cap={cap}
                    allFeatures={features}
                    laneId={laneId}
                    onFeatureClick={onItemClick}
                    onCapabilityClick={onCapabilityClick}
                    onFeaturePhaseToggle={onFeaturePhaseToggle}
                  />
                </SortableKanbanItem>
              ))}
              {orphanFeatures.length > 0 && capEntries.length > 0 && (
                <div className="flex items-center gap-1.5 px-1 py-1 mt-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Unplanned Features
                  </span>
                  <span className="text-[10px] text-muted-foreground">({orphanFeatures.length})</span>
                </div>
              )}
              {orphanFeatures.map((item) => (
                <SortableKanbanItem
                  key={item.id}
                  itemId={item.id}
                  itemType="feature"
                  onClick={() => onItemClick?.(item)}
                >
                  <FeatureKanbanCard item={item} />
                </SortableKanbanItem>
              ))}
            </>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function KanbanView({
  items,
  milestones,
  capabilities,
  onItemClick,
  onCapabilityClick,
  onMilestoneAssign,
  onFeaturePhaseToggle,
}: {
  items: RoadmapItemData[];
  milestones: MilestoneOverlay[];
  capabilities: CapabilityData[];
  onItemClick?: (item: RoadmapItemData) => void;
  onCapabilityClick?: (cap: CapabilityData) => void;
  onMilestoneAssign?: (itemId: string, milestoneId: string | null, itemType: "feature" | "capability") => void;
  onFeaturePhaseToggle?: (featureId: string, milestoneId: string | null, assign: boolean) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sort milestones: active first, then by target_date
  const sortedMilestones = useMemo(() => {
    return [...milestones]
      .filter((m) => m.status !== "released" && m.status !== "archived")
      .sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        if (a.release_type === "major" && b.release_type !== "major") return -1;
        if (b.release_type === "major" && a.release_type !== "major") return 1;
        const ta = a.target_date ? new Date(a.target_date).getTime() : Infinity;
        const tb = b.target_date ? new Date(b.target_date).getTime() : Infinity;
        return ta - tb;
      });
  }, [milestones]);

  // Build feature lookup by capability_id from junction table (source of truth)
  const featuresByCapability = useMemo(() => {
    const map = new Map<string, RoadmapItemData[]>();
    const orphans: RoadmapItemData[] = [];
    for (const item of items) {
      const capId = item.capability_id;
      if (capId) {
        if (!map.has(capId)) map.set(capId, []);
        map.get(capId)!.push(item);
      } else {
        orphans.push(item);
      }
    }
    return { map, orphans };
  }, [items]);

  // Build lanes for capabilities — a capability appears in each lane where it has features
  // and in the Unplanned lane if it has any unplanned features
  const capLanes = useMemo(() => {
    const result: Record<string, { cap: CapabilityData; features: RoadmapItemData[] }[]> = { unplanned: [] };
    for (const m of sortedMilestones) {
      result[m.id] = [];
    }
    for (const cap of capabilities) {
      const allCapFeatures = featuresByCapability.map.get(cap.id) ?? [];
      if (allCapFeatures.length === 0) {
        // Capability with no features: place based on capability's own milestone
        const entry = { cap, features: allCapFeatures };
        if (cap.milestone_id && result[cap.milestone_id]) {
          result[cap.milestone_id].push(entry);
        } else {
          result.unplanned.push(entry);
        }
        continue;
      }

      // Group features by their milestone
      const unplannedFeatures = allCapFeatures.filter((f) => !f.milestone_id);
      const plannedByMilestone = new Map<string, RoadmapItemData[]>();
      for (const f of allCapFeatures) {
        if (f.milestone_id) {
          if (!plannedByMilestone.has(f.milestone_id)) plannedByMilestone.set(f.milestone_id, []);
          plannedByMilestone.get(f.milestone_id)!.push(f);
        }
      }

      // Place capability in each milestone lane where it has features
      for (const [msId] of plannedByMilestone) {
        if (result[msId]) {
          result[msId].push({ cap, features: allCapFeatures });
        }
      }

      // Place in Unplanned if there are unplanned features
      if (unplannedFeatures.length > 0) {
        result.unplanned.push({ cap, features: allCapFeatures });
      }

      // If capability has no features in any lane yet, fall back to its own milestone
      if (plannedByMilestone.size === 0 && unplannedFeatures.length === 0) {
        const entry = { cap, features: allCapFeatures };
        if (cap.milestone_id && result[cap.milestone_id]) {
          result[cap.milestone_id].push(entry);
        } else {
          result.unplanned.push(entry);
        }
      }
    }
    return result;
  }, [capabilities, sortedMilestones, featuresByCapability.map]);

  // Build lanes for orphan features (no capability) by their milestone
  const orphanLanes = useMemo(() => {
    const result: Record<string, RoadmapItemData[]> = { unplanned: [] };
    for (const m of sortedMilestones) {
      result[m.id] = [];
    }
    for (const item of featuresByCapability.orphans) {
      if (item.milestone_id && result[item.milestone_id]) {
        result[item.milestone_id].push(item);
      } else {
        result.unplanned.push(item);
      }
    }
    return result;
  }, [featuresByCapability.orphans, sortedMilestones]);

  // Build lane map for drag-and-drop resolution
  const itemLaneMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [laneId, entries] of Object.entries(capLanes)) {
      for (const entry of entries) {
        map.set(`cap-${entry.cap.id}-${laneId}`, laneId);
      }
    }
    for (const [laneId, feats] of Object.entries(orphanLanes)) {
      for (const f of feats) {
        map.set(f.id, laneId);
      }
    }
    return map;
  }, [capLanes, orphanLanes]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;
  const activeCap = activeId?.startsWith("cap-")
    ? capabilities.find((c) => activeId.startsWith(`cap-${c.id}-`))
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const dragId = active.id as string;
    const overId = over.id as string;

    let targetLane: string | null = null;
    if (overId.startsWith("lane-")) {
      targetLane = overId.replace("lane-", "");
    } else {
      targetLane = itemLaneMap.get(overId) ?? null;
    }

    if (targetLane !== null) {
      const currentLane = itemLaneMap.get(dragId) ?? "unplanned";
      if (currentLane !== targetLane) {
        const newMilestoneId = targetLane === "unplanned" ? null : targetLane;
        if (dragId.startsWith("cap-")) {
          // Extract capId from lane-scoped ID: cap-{uuid}-{laneId}
          const parts = dragId.split("-");
          // UUID is parts[1..5] (5 segments), laneId is the rest
          const capId = parts.slice(1, 6).join("-");
          onMilestoneAssign?.(capId, newMilestoneId, "capability");
        } else {
          onMilestoneAssign?.(dragId, newMilestoneId, "feature");
        }
      }
    }
  }

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      const laneHit = pointerCollisions.find((c) => String(c.id).startsWith("lane-"));
      if (laneHit) return [laneHit];
      return pointerCollisions;
    }
    return rectIntersection(args);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 p-3 h-full overflow-x-auto">
        <KanbanLane
          laneId="unplanned"
          title="📥 Unplanned"
          description="Not in any release"
          capEntries={capLanes.unplanned}
          orphanFeatures={orphanLanes.unplanned}
          onItemClick={onItemClick}
          onCapabilityClick={onCapabilityClick}
          onFeaturePhaseToggle={onFeaturePhaseToggle}
        />
        {sortedMilestones.map((m) => (
          <KanbanLane
            key={m.id}
            laneId={m.id}
            title={`${m.release_type === "major" ? "🚀" : "🔧"} ${m.version_label || m.title}`}
            description={`${m.status}${m.target_date ? ` · due ${m.target_date}` : ""}${m.item_count > 0 ? ` · ${m.completion_pct}% done` : ""}`}
            accent={m.release_type === "major" ? "bg-indigo-500" : "bg-teal-500"}
            capEntries={capLanes[m.id] ?? []}
            orphanFeatures={orphanLanes[m.id] ?? []}
            onItemClick={onItemClick}
            onCapabilityClick={onCapabilityClick}
            onFeaturePhaseToggle={onFeaturePhaseToggle}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCap ? (
          <div className="opacity-90 w-72">
            <CapabilityKanbanCard
              cap={activeCap}
              allFeatures={featuresByCapability.map.get(activeCap.id) ?? []}
              laneId="unplanned"
            />
          </div>
        ) : activeItem ? (
          <div className="opacity-90 w-64">
            <FeatureKanbanCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// =============================================================================
// FILTER BAR
// =============================================================================

function FilterBar({
  items,
  milestoneOverlays,
  filters,
  setFilters,
}: {
  items: RoadmapItemData[];
  milestoneOverlays: MilestoneOverlay[];
  filters: { capability: string | null; priority: string | null; status: string | null; milestone: string | null; releaseType: string | null };
  setFilters: (f: { capability: string | null; priority: string | null; status: string | null; milestone: string | null; releaseType: string | null }) => void;
}) {
  const capabilities = useMemo(() => {
    const set = new Map<string, string>();
    for (const item of items) {
      if (item.capability_id && item.capability_name) {
        set.set(item.capability_id, item.capability_name);
      }
    }
    return Array.from(set.entries());
  }, [items]);

  // Merge milestones from both the overlay list and from items
  const milestones = useMemo(() => {
    const set = new Map<string, string>();
    for (const m of milestoneOverlays) {
      set.set(m.id, m.version_label || m.title);
    }
    for (const item of items) {
      if (item.milestone_id && !set.has(item.milestone_id)) {
        set.set(item.milestone_id, item.milestone_version_label || item.milestone_title || item.milestone_id);
      }
    }
    return Array.from(set.entries());
  }, [milestoneOverlays, items]);

  const statuses = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.status)));
  }, [items]);

  const priorities = ["critical", "high", "medium", "low"];

  const activeCount = [filters.capability, filters.priority, filters.status, filters.milestone, filters.releaseType].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/10 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium">Filters:</span>
      <select
        className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
        value={filters.capability ?? ""}
        onChange={(e) => setFilters({ ...filters, capability: e.target.value || null })}
      >
        <option value="">All Capabilities</option>
        {capabilities.map(([id, name]) => (
          <option key={id} value={id}>{name}</option>
        ))}
      </select>
      <select
        className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
        value={filters.milestone ?? ""}
        onChange={(e) => setFilters({ ...filters, milestone: e.target.value || null })}
      >
        <option value="">All Milestones</option>
        <option value="__none__">No Milestone</option>
        {milestones.map(([id, label]) => (
          <option key={id} value={id}>{label}</option>
        ))}
      </select>
      <select
        className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
        value={filters.priority ?? ""}
        onChange={(e) => setFilters({ ...filters, priority: e.target.value || null })}
      >
        <option value="">All Priorities</option>
        {priorities.map((p) => (
          <option key={p} value={p} className="capitalize">{p}</option>
        ))}
      </select>
      <select
        className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
        value={filters.releaseType ?? ""}
        onChange={(e) => setFilters({ ...filters, releaseType: e.target.value || null })}
      >
        <option value="">All Release Types</option>
        <option value="major">Major Releases</option>
        <option value="minor">Minor Releases</option>
      </select>
      <select
        className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
        value={filters.status ?? ""}
        onChange={(e) => setFilters({ ...filters, status: e.target.value || null })}
      >
        <option value="">All Statuses</option>
        {statuses.map((s) => (
          <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>
        ))}
      </select>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => setFilters({ capability: null, priority: null, status: null, milestone: null, releaseType: null })}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// =============================================================================
// STATUS LEGEND
// =============================================================================

function StatusLegend({ colorBy }: { colorBy: ColorBy }) {
  const entries = colorBy === "status"
    ? Object.entries(STATUS_COLORS).filter(([k]) => k !== "rejected")
    : colorBy === "priority"
      ? Object.entries(PRIORITY_COLORS)
      : [];

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1 border-t border-border bg-muted/10">
      <span className="text-[10px] text-muted-foreground">Legend:</span>
      {entries.map(([key, cls]) => (
        <div key={key} className="flex items-center gap-1">
          <div className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
          <span className="text-[10px] text-muted-foreground capitalize">{key.replace("_", " ")}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN ROADMAP CONTENT
// =============================================================================

function RoadmapContent({ content }: { content: string }) {
  const { selectedRepositoryId } = useSelectedRepository();
  const [allItems, setAllItems] = useState<RoadmapItemData[]>([]);
  const [milestones, setMilestones] = useState<MilestoneOverlay[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityData[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [zoom, setZoom] = useState<ZoomLevel>("monthly");
  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [filters, setFilters] = useState<{
    capability: string | null;
    priority: string | null;
    status: string | null;
    milestone: string | null;
    releaseType: string | null;
  }>({ capability: null, priority: null, status: null, milestone: null, releaseType: null });

  const hasFetchedRef = useRef(false);

  // Fetch roadmap data with milestones
  useEffect(() => {
    const productParam = selectedRepositoryId
      ? `productId=${selectedRepositoryId}&`
      : "";
    fetch(`/api/roadmap?${productParam}includeMilestones=true`)
      .then((res) => (res.ok ? res.json() : { items: [], milestones: [] }))
      .then((data) => {
        if (data && data.items && Array.isArray(data.items)) {
          hasFetchedRef.current = true;
          setAllItems(data.items);
          if (Array.isArray(data.milestones)) {
            setMilestones(data.milestones);
          }
          if (Array.isArray(data.capabilities)) {
            setCapabilities(data.capabilities);
          }
        } else if (Array.isArray(data)) {
          // Backward compat: old API returns array directly
          hasFetchedRef.current = true;
          setAllItems(data);
        }
      })
      .catch(() => {});
  }, [selectedRepositoryId]);

  // Sync from streaming content
  useEffect(() => {
    if (hasFetchedRef.current) return;
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data) && data.length > 0) {
        setAllItems(data);
      }
    } catch {
      // ignore
    }
  }, [content]);

  // Apply filters
  const filteredItems = useMemo(() => {
    let result = allItems;
    if (filters.capability) {
      result = result.filter((i) => (i.primary_capability_id ?? i.capability_id) === filters.capability);
    }
    if (filters.priority) {
      result = result.filter((i) => i.priority === filters.priority);
    }
    if (filters.status) {
      result = result.filter((i) => i.status === filters.status);
    }
    if (filters.releaseType) {
      result = result.filter((i) => i.milestone_release_type === filters.releaseType || !i.milestone_id);
    }
    if (filters.milestone && filters.milestone !== "__none__") {
      // In kanban: show matching milestone items + unplanned (for drag-drop)
      // In timeline: only show matching milestone items
      result = result.filter((i) => i.milestone_id === filters.milestone || !i.milestone_id);
    } else if (filters.milestone === "__none__") {
      result = result.filter((i) => !i.milestone_id);
    }
    return result;
  }, [allItems, filters]);

  // Capability color map
  const capabilityColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const capIds = new Set<string>();
    for (const item of allItems) {
      if (item.capability_id) capIds.add(item.capability_id);
    }
    let i = 0;
    for (const id of capIds) {
      map.set(id, CAPABILITY_COLORS[i % CAPABILITY_COLORS.length]);
      i++;
    }
    return map;
  }, [allItems]);

  // Handle horizon change from kanban drag-and-drop
  const handleHorizonChange = useCallback(async (itemId: string, horizon: string) => {
    const newHorizon = horizon === "" ? null : horizon;
    // Optimistic update
    setAllItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, roadmap_horizon: newHorizon as any } : item
      )
    );

    try {
      const res = await fetch("/api/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, roadmapHorizon: newHorizon }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(newHorizon ? `Moved to ${newHorizon}` : "Removed from horizon");
    } catch {
      // Revert
      toast.error("Failed to update horizon");
      const productParam = selectedRepositoryId
        ? `?productId=${selectedRepositoryId}`
        : "";
      fetch(`/api/roadmap${productParam}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setAllItems(data);
        })
        .catch(() => {});
    }
  }, [selectedRepositoryId]);

  // Handle schedule change from timeline drag
  const handleScheduleChange = useCallback(async (itemId: string, plannedStart: string, plannedEnd: string) => {
    // Optimistic update
    setAllItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, planned_start: plannedStart, planned_end: plannedEnd } : item
      )
    );

    try {
      const res = await fetch("/api/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, plannedStart, plannedEnd }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Schedule updated");
    } catch {
      toast.error("Failed to update schedule");
      const productParam = selectedRepositoryId
        ? `?productId=${selectedRepositoryId}`
        : "";
      fetch(`/api/roadmap${productParam}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setAllItems(data);
        })
        .catch(() => {});
    }
  }, [selectedRepositoryId]);

  const { push } = useArtifactStack();

  const handleItemClick = useCallback((item: RoadmapItemData) => {
    push({
      documentId: item.id,
      kind: "feature",
      title: item.title,
    });
  }, [push]);

  const handleCapabilityClick = useCallback((cap: CapabilityData) => {
    push({
      documentId: cap.id,
      kind: "capability",
      title: cap.name,
    });
  }, [push]);

  // Handle milestone assignment from kanban drag-and-drop
  const handleMilestoneAssign = useCallback(async (itemId: string, milestoneId: string | null, itemType: "feature" | "capability") => {
    const targetMs = milestoneId ? milestones.find((m) => m.id === milestoneId) : null;
    const label = targetMs ? (targetMs.version_label || targetMs.title) : "Unplanned";

    if (itemType === "capability") {
      const cap = capabilities.find((c) => c.id === itemId);
      if (!cap) return;
      const previousMilestoneId = cap.milestone_id;

      // Collect unplanned features belonging to this capability — they move with the card
      const capFeatures = allItems.filter((i) => i.capability_id === itemId);
      const unplannedFeatures = milestoneId
        ? capFeatures.filter((f) => !f.milestone_id)
        : []; // When dragging to Unplanned, only the capability itself moves

      // Optimistic update — capability
      setCapabilities((prev) =>
        prev.map((c) =>
          c.id === itemId
            ? {
                ...c,
                milestone_id: milestoneId,
                milestone_title: targetMs?.title ?? null,
                milestone_version_label: targetMs?.version_label ?? null,
                milestone_release_type: targetMs?.release_type ?? null,
                milestone_target_date: targetMs?.target_date ?? null,
              }
            : c
        )
      );

      // Optimistic update — move unplanned features to target milestone
      const movedFeatureIds = new Set(unplannedFeatures.map((f) => f.id));
      if (movedFeatureIds.size > 0) {
        setAllItems((prev) =>
          prev.map((i) =>
            movedFeatureIds.has(i.id)
              ? {
                  ...i,
                  milestone_id: milestoneId,
                  milestone_title: targetMs?.title ?? null,
                  milestone_version_label: targetMs?.version_label ?? null,
                  milestone_release_type: targetMs?.release_type ?? null,
                  milestone_target_date: targetMs?.target_date ?? null,
                }
              : i
          )
        );
      }

      try {
        // Move capability itself
        if (previousMilestoneId) {
          const removeRes = await fetch(`/api/milestones/${previousMilestoneId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", itemType: "capability", itemId }),
          });
          if (!removeRes.ok) throw new Error("Failed to remove from milestone");
        }
        if (milestoneId) {
          const addRes = await fetch(`/api/milestones/${milestoneId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add", itemType: "capability", itemId }),
          });
          if (!addRes.ok) throw new Error("Failed to add to milestone");
        }

        // Move unplanned features in parallel
        if (milestoneId && unplannedFeatures.length > 0) {
          await Promise.all(
            unplannedFeatures.map((f) =>
              fetch(`/api/milestones/${milestoneId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add", itemType: "feature", itemId: f.id }),
              })
            )
          );
        }

        const featureNote = unplannedFeatures.length > 0
          ? ` (+${unplannedFeatures.length} feature${unplannedFeatures.length !== 1 ? "s" : ""})`
          : "";
        toast.success(`🧩 ${cap.name} → ${label}${featureNote}`);
      } catch {
        toast.error("Failed to update milestone assignment");
        // Revert capability
        setCapabilities((prev) =>
          prev.map((c) =>
            c.id === itemId
              ? {
                  ...c,
                  milestone_id: previousMilestoneId,
                  milestone_title: cap.milestone_title,
                  milestone_version_label: cap.milestone_version_label,
                  milestone_release_type: cap.milestone_release_type,
                  milestone_target_date: cap.milestone_target_date,
                }
              : c
          )
        );
        // Revert features
        if (movedFeatureIds.size > 0) {
          setAllItems((prev) =>
            prev.map((i) => {
              if (!movedFeatureIds.has(i.id)) return i;
              const original = unplannedFeatures.find((f) => f.id === i.id);
              return original
                ? {
                    ...i,
                    milestone_id: original.milestone_id,
                    milestone_title: original.milestone_title,
                    milestone_version_label: original.milestone_version_label,
                    milestone_release_type: original.milestone_release_type,
                    milestone_target_date: original.milestone_target_date,
                  }
                : i;
            })
          );
        }
      }
    } else {
      // Feature assignment
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return;
      const previousMilestoneId = item.milestone_id;

      setAllItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                milestone_id: milestoneId,
                milestone_title: targetMs?.title ?? null,
                milestone_version_label: targetMs?.version_label ?? null,
                milestone_release_type: targetMs?.release_type ?? null,
                milestone_target_date: targetMs?.target_date ?? null,
              }
            : i
        )
      );

      try {
        if (previousMilestoneId) {
          const removeRes = await fetch(`/api/milestones/${previousMilestoneId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", itemType: "feature", itemId }),
          });
          if (!removeRes.ok) throw new Error("Failed to remove from milestone");
        }
        if (milestoneId) {
          const addRes = await fetch(`/api/milestones/${milestoneId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add", itemType: "feature", itemId }),
          });
          if (!addRes.ok) throw new Error("Failed to add to milestone");
        }
        toast.success(`Moved to ${label}`);
      } catch {
        toast.error("Failed to update milestone assignment");
        setAllItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  milestone_id: previousMilestoneId,
                  milestone_title: item.milestone_title,
                  milestone_version_label: item.milestone_version_label,
                  milestone_release_type: item.milestone_release_type,
                  milestone_target_date: item.milestone_target_date,
                }
              : i
          )
        );
      }
    }
  }, [allItems, milestones, capabilities]);

  // Handle feature phase toggle (checkmark selection on capability cards)
  const handleFeaturePhaseToggle = useCallback(async (featureId: string, milestoneId: string | null, assign: boolean) => {
    const item = allItems.find((i) => i.id === featureId);
    if (!item) return;

    const targetMs = milestoneId ? milestones.find((m) => m.id === milestoneId) : null;
    const label = targetMs ? (targetMs.version_label || targetMs.title) : "Unplanned";

    if (assign && milestoneId) {
      // Assign feature to milestone
      const previousMilestoneId = item.milestone_id;

      // Optimistic update
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === featureId
            ? {
                ...i,
                milestone_id: milestoneId,
                milestone_title: targetMs?.title ?? null,
                milestone_version_label: targetMs?.version_label ?? null,
                milestone_release_type: targetMs?.release_type ?? null,
                milestone_target_date: targetMs?.target_date ?? null,
              }
            : i
        )
      );

      try {
        // Remove from old milestone if needed
        if (previousMilestoneId) {
          const removeRes = await fetch(`/api/milestones/${previousMilestoneId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", itemType: "feature", itemId: featureId }),
          });
          if (!removeRes.ok) throw new Error("Failed to remove from previous milestone");
        }
        // Add to new milestone
        const addRes = await fetch(`/api/milestones/${milestoneId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", itemType: "feature", itemId: featureId }),
        });
        if (!addRes.ok) throw new Error("Failed to add to milestone");
        toast.success(`✅ ${item.title} → ${label}`);
      } catch {
        toast.error("Failed to assign feature to phase");
        // Revert
        setAllItems((prev) =>
          prev.map((i) =>
            i.id === featureId
              ? {
                  ...i,
                  milestone_id: previousMilestoneId,
                  milestone_title: item.milestone_title,
                  milestone_version_label: item.milestone_version_label,
                  milestone_release_type: item.milestone_release_type,
                  milestone_target_date: item.milestone_target_date,
                }
              : i
          )
        );
      }
    } else if (!assign && item.milestone_id) {
      // Unassign feature from milestone
      const previousMilestoneId = item.milestone_id;

      // Optimistic update
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === featureId
            ? {
                ...i,
                milestone_id: null,
                milestone_title: null,
                milestone_version_label: null,
                milestone_release_type: null,
                milestone_target_date: null,
              }
            : i
        )
      );

      try {
        const removeRes = await fetch(`/api/milestones/${previousMilestoneId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", itemType: "feature", itemId: featureId }),
        });
        if (!removeRes.ok) throw new Error("Failed to remove from milestone");
        toast.success(`☐ ${item.title} removed from ${label}`);
      } catch {
        toast.error("Failed to remove feature from phase");
        // Revert
        setAllItems((prev) =>
          prev.map((i) =>
            i.id === featureId
              ? {
                  ...i,
                  milestone_id: previousMilestoneId,
                  milestone_title: item.milestone_title,
                  milestone_version_label: item.milestone_version_label,
                  milestone_release_type: item.milestone_release_type,
                  milestone_target_date: item.milestone_target_date,
                }
              : i
          )
        );
      }
    }
  }, [allItems, milestones]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* View mode tabs */}
      <div className="flex items-center border-b border-border px-4">
        <div className="flex">
          {(["kanban", "timeline"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                viewMode === mode
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "timeline" ? "📊 Timeline" : "📋 Kanban"}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filteredItems.length} items
        </div>
      </div>

      {/* Control bar (timeline only) */}
      {viewMode === "timeline" && (
        <TimelineControlBar
          zoom={zoom}
          setZoom={setZoom}
          colorBy={colorBy}
          setColorBy={setColorBy}
        />
      )}

      {/* Filter bar */}
      <FilterBar items={allItems} milestoneOverlays={milestones} filters={filters} setFilters={setFilters} />

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {viewMode === "kanban" ? (
          <KanbanView
            items={filteredItems}
            milestones={filters.releaseType ? milestones.filter((m) => m.release_type === filters.releaseType) : milestones}
            capabilities={capabilities}
            onItemClick={handleItemClick}
            onCapabilityClick={handleCapabilityClick}
            onMilestoneAssign={handleMilestoneAssign}
            onFeaturePhaseToggle={handleFeaturePhaseToggle}
          />
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="text-lg mb-2">🗺️</div>
            <div className="text-sm">
              {allItems.length === 0
                ? "No features are scheduled on the roadmap yet."
                : "No items match your current filters."}
            </div>
            {allItems.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ capability: null, priority: null, status: null, milestone: null, releaseType: null })}
                className="text-xs text-primary hover:underline mt-1"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <TimelineView
            items={filteredItems}
            zoom={zoom}
            colorBy={colorBy}
            capabilityColorMap={capabilityColorMap}
            milestones={milestones}
            onItemClick={handleItemClick}
            onCapabilityClick={(capId, capName) => handleCapabilityClick({ id: capId, name: capName } as CapabilityData)}
            onScheduleChange={handleScheduleChange}
          />
        )}
      </div>

      {/* Legend (timeline only) */}
      {viewMode === "timeline" && <StatusLegend colorBy={colorBy} />}
    </div>
  );
}

// =============================================================================
// ARTIFACT EXPORT
// =============================================================================

export const roadmapArtifact = new Artifact<"roadmap", RoadmapArtifactMetadata>(
  {
    kind: "roadmap",
    description:
      "Product roadmap — interactive timeline and kanban views for strategic planning and visualization.",

    initialize: async ({ setMetadata, setArtifact }) => {
      setMetadata({ isRefreshing: false });
      setArtifact((current) => ({
        ...current,
        content: current.content || "[]",
      }));
    },

    onStreamPart: ({ streamPart, setArtifact }) => {
      if (streamPart.type === "data-roadmapDelta") {
        setArtifact((draftArtifact) => ({
          ...draftArtifact,
          content: streamPart.data as string,
          isVisible: true,
          status: "streaming",
        }));
      }
    },

    content: ({ content, isLoading }) => {
      if (isLoading || !content) {
        return <DocumentSkeleton artifactKind="text" />;
      }

      return <RoadmapContent content={content} />;
    },

    actions: [
      {
        icon: <CopyIcon size={18} />,
        description: "Copy roadmap summary",
        onClick: ({ content }) => {
          try {
            const items = JSON.parse(content) as RoadmapItemData[];
            const text = items
              .map(
                (item, i) =>
                  `${i + 1}. ${item.title} — ${item.priority} — ${item.status}${item.roadmap_horizon ? ` [${item.roadmap_horizon}]` : ""}${item.planned_start ? ` (${item.planned_start} → ${item.planned_end})` : ""}`
              )
              .join("\n");
            navigator.clipboard.writeText(
              `Product Roadmap (${items.length} items)\n\n${text}`
            );
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
        description: "AI Roadmap Analysis",
        immediate: true,
        onClick: ({ sendMessage }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: "Please analyze the current product roadmap. Identify any scheduling conflicts, at-risk items, and suggest prioritization improvements based on dependencies and strategic alignment.",
              },
            ],
          });
        },
      },
    ],
  }
);
