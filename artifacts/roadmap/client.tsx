"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
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
  capability_name: string | null;
  capability_id: string | null;
  task_total: number;
  task_done: number;
  repository_id: string;
}

type RoadmapArtifactMetadata = {
  isRefreshing: boolean;
};

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
      return capabilityColorMap.get(item.capability_id ?? "") ?? "bg-gray-300 dark:bg-gray-600";
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

function TimelineView({
  items,
  zoom,
  colorBy,
  capabilityColorMap,
  onItemClick,
}: {
  items: RoadmapItemData[];
  zoom: ZoomLevel;
  colorBy: ColorBy;
  capabilityColorMap: Map<string, string>;
  onItemClick?: (item: RoadmapItemData) => void;
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
    const groups = new Map<string, { name: string; items: RoadmapItemData[] }>();
    const ungrouped: RoadmapItemData[] = [];

    for (const item of items) {
      if (item.capability_id && item.capability_name) {
        if (!groups.has(item.capability_id)) {
          groups.set(item.capability_id, { name: item.capability_name, items: [] });
        }
        groups.get(item.capability_id)!.items.push(item);
      } else {
        ungrouped.push(item);
      }
    }

    const result: { name: string | null; items: RoadmapItemData[] }[] = [];
    for (const [, group] of groups) {
      result.push(group);
    }
    if (ungrouped.length > 0) {
      result.push({ name: null, items: ungrouped });
    }
    return result;
  }, [items]);

  // Items with dates for timeline, items without for the "unscheduled" section
  const scheduledItems = items.filter((i) => i.planned_start && i.planned_end);
  const unscheduledItems = items.filter((i) => !i.planned_start || !i.planned_end);

  const pixelsPerDay = zoom === "quarterly" ? 3 : zoom === "monthly" ? 6 : 12;
  const totalWidth = totalDays * pixelsPerDay;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-auto">
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

          {/* Grouped rows */}
          {grouped.map((group, gi) => (
            <div key={gi}>
              {group.name && (
                <div className="flex border-b border-border/50 bg-muted/20">
                  <div className="w-48 min-w-48 border-r border-border px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <span>🧩</span> {group.name}
                  </div>
                  <div className="flex-1" />
                </div>
              )}
              {group.items.map((item) => {
                const progress = getProgressPercent(item);
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`absolute top-1 h-5 rounded-sm ${barColor} opacity-80 hover:opacity-100 transition-opacity cursor-pointer flex items-center px-1.5 overflow-hidden`}
                                style={{
                                  left: `${leftPercent}%`,
                                  width: `${widthPercent}%`,
                                  minWidth: "24px",
                                }}
                                onClick={() => onItemClick?.(item)}
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
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-0.5">
                                <div className="font-medium">{item.title}</div>
                                <div>{format(parseISO(item.planned_start), "MMM d")} → {format(parseISO(item.planned_end), "MMM d, yyyy")}</div>
                                <div className="capitalize">Status: {item.status.replace("_", " ")}</div>
                                <div className="capitalize">Priority: {item.priority}</div>
                                {progress !== null && <div>Progress: {progress}%</div>}
                                {item.capability_name && <div>Capability: {item.capability_name}</div>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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

function KanbanCard({
  item,
  onClick,
}: {
  item: RoadmapItemData;
  onClick?: () => void;
}) {
  const progress = getProgressPercent(item);
  const badge = PRIORITY_BADGES[item.priority];
  const isAtRisk = item.status === "blocked" || (progress !== null && progress < 30 && item.status === "implementation");

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer ${
        isAtRisk
          ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20"
          : "border-border bg-card hover:bg-accent/50"
      }`}
    >
      <div className="text-sm font-medium mb-1.5 line-clamp-2">{item.title}</div>
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {badge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </span>
        )}
        {item.capability_name && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium">
            {item.capability_name}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
          {item.status.replace("_", " ")}
        </span>
      </div>
      {progress !== null && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress === 100
                  ? "bg-green-500"
                  : progress > 50
                    ? "bg-blue-500"
                    : "bg-orange-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {isAtRisk && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
          <span>⚠️</span> At Risk
        </div>
      )}
    </button>
  );
}

function KanbanLane({
  horizon,
  items,
  onItemClick,
}: {
  horizon: string;
  items: RoadmapItemData[];
  onItemClick?: (item: RoadmapItemData) => void;
}) {
  const { setNodeRef } = useSortable({ id: horizon });
  const info = HORIZON_LABELS[horizon] ?? { title: horizon, description: "" };

  const totalEffort = items.length;

  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-64 flex flex-col bg-muted/20 rounded-lg border border-border overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{info.title}</div>
            <div className="text-[10px] text-muted-foreground">{info.description}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{items.length}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground/50 text-center py-8 italic">
            Drag features here to plan for {info.title.toLowerCase()}
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              onClick={() => onItemClick?.(item)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanView({
  items,
  onItemClick,
  onHorizonChange,
}: {
  items: RoadmapItemData[];
  onItemClick?: (item: RoadmapItemData) => void;
  onHorizonChange?: (itemId: string, horizon: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const lanes = useMemo(() => {
    const now: RoadmapItemData[] = [];
    const next: RoadmapItemData[] = [];
    const later: RoadmapItemData[] = [];
    const unassigned: RoadmapItemData[] = [];

    for (const item of items) {
      switch (item.roadmap_horizon) {
        case "now": now.push(item); break;
        case "next": next.push(item); break;
        case "later": later.push(item); break;
        default: unassigned.push(item); break;
      }
    }

    return { now, next, later, unassigned };
  }, [items]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const itemId = active.id as string;
    const targetLane = over.id as string;

    if (["now", "next", "later"].includes(targetLane)) {
      const item = items.find((i) => i.id === itemId);
      if (item && item.roadmap_horizon !== targetLane) {
        onHorizonChange?.(itemId, targetLane);
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 p-3 h-full overflow-x-auto">
        <SortableContext items={["now", "next", "later"]} strategy={verticalListSortingStrategy}>
          <KanbanLane horizon="now" items={lanes.now} onItemClick={onItemClick} />
          <KanbanLane horizon="next" items={lanes.next} onItemClick={onItemClick} />
          <KanbanLane horizon="later" items={lanes.later} onItemClick={onItemClick} />
        </SortableContext>
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="opacity-80">
            <KanbanCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>

      {/* Unassigned items */}
      {lanes.unassigned.length > 0 && (
        <div className="border-t border-border px-4 py-2 bg-muted/10">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            Unassigned to horizon ({lanes.unassigned.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lanes.unassigned.slice(0, 12).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onItemClick?.(item)}
                className="text-xs px-2 py-1 rounded-md border border-border bg-card hover:bg-accent/50 truncate max-w-48"
                title={item.title}
              >
                {item.title}
              </button>
            ))}
            {lanes.unassigned.length > 12 && (
              <span className="text-xs text-muted-foreground self-center">+{lanes.unassigned.length - 12} more</span>
            )}
          </div>
        </div>
      )}
    </DndContext>
  );
}

// =============================================================================
// FILTER BAR
// =============================================================================

function FilterBar({
  items,
  filters,
  setFilters,
}: {
  items: RoadmapItemData[];
  filters: { capability: string | null; priority: string | null; status: string | null };
  setFilters: (f: { capability: string | null; priority: string | null; status: string | null }) => void;
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

  const statuses = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.status)));
  }, [items]);

  const priorities = ["critical", "high", "medium", "low"];

  const activeCount = [filters.capability, filters.priority, filters.status].filter(Boolean).length;

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
          onClick={() => setFilters({ capability: null, priority: null, status: null })}
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
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [zoom, setZoom] = useState<ZoomLevel>("monthly");
  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [filters, setFilters] = useState<{
    capability: string | null;
    priority: string | null;
    status: string | null;
  }>({ capability: null, priority: null, status: null });

  const hasFetchedRef = useRef(false);

  // Fetch roadmap data
  useEffect(() => {
    const repoParam = selectedRepositoryId
      ? `?repositoryId=${selectedRepositoryId}`
      : "";
    fetch(`/api/roadmap${repoParam}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
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
      result = result.filter((i) => i.capability_id === filters.capability);
    }
    if (filters.priority) {
      result = result.filter((i) => i.priority === filters.priority);
    }
    if (filters.status) {
      result = result.filter((i) => i.status === filters.status);
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
    // Optimistic update
    setAllItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, roadmap_horizon: horizon as any } : item
      )
    );

    try {
      const res = await fetch("/api/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, roadmapHorizon: horizon }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Horizon updated");
    } catch {
      // Revert
      toast.error("Failed to update horizon");
      const repoParam = selectedRepositoryId
        ? `?repositoryId=${selectedRepositoryId}`
        : "";
      fetch(`/api/roadmap${repoParam}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setAllItems(data);
        })
        .catch(() => {});
    }
  }, [selectedRepositoryId]);

  const handleItemClick = useCallback((item: RoadmapItemData) => {
    // Could navigate to feature detail - for now just show toast
    toast.info(`${item.title} — ${item.status}`);
  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* View mode tabs */}
      <div className="flex items-center border-b border-border px-4">
        <div className="flex">
          {(["timeline", "kanban"] as ViewMode[]).map((mode) => (
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
      <FilterBar items={allItems} filters={filters} setFilters={setFilters} />

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="text-lg mb-2">🗺️</div>
            <div className="text-sm">
              {allItems.length === 0
                ? "No features are scheduled on the roadmap yet."
                : "No items match your current filters."}
            </div>
            {allItems.length > 0 && filters.capability !== null && (
              <button
                type="button"
                onClick={() => setFilters({ capability: null, priority: null, status: null })}
                className="text-xs text-primary hover:underline mt-1"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === "timeline" ? (
          <TimelineView
            items={filteredItems}
            zoom={zoom}
            colorBy={colorBy}
            capabilityColorMap={capabilityColorMap}
            onItemClick={handleItemClick}
          />
        ) : (
          <KanbanView
            items={filteredItems}
            onItemClick={handleItemClick}
            onHorizonChange={handleHorizonChange}
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
