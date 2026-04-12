"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  type DragOverEvent,
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
import {
  CopyIcon,
  MessageIcon,
  SparklesIcon,
} from "@/components/icons";
import { useAIToolAction } from "@/hooks/use-ai-tool-action";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSWRConfig } from "swr";
import type { UIArtifact } from "@/components/artifact";

interface BacklogItemData {
  id: string;
  item_type: "feature" | "bug";
  item_id: string;
  rank: number;
  priority?: string;
  status?: string;
  sprint_label?: string;
  acceptance_criteria?: string;
  item_title?: string;
  item_status?: string;
  item_priority?: string;
  item_description?: string;
  ai_metadata?: Record<string, any>;
  task_total?: number;
  task_done?: number;
}

type BacklogArtifactMetadata = {
  isRefreshing: boolean;
};

// =============================================================================
// KANBAN COLUMN CONFIGURATION
// =============================================================================

/** Maps each kanban column to the statuses it contains */
const KANBAN_COLUMNS: {
  id: string;
  label: string;
  statuses: string[];
  color: string;
}[] = [
  { id: "draft", label: "Draft", statuses: ["draft"], color: "border-t-gray-400" },
  { id: "triage_plan", label: "Triage / Plan", statuses: ["triage", "backlog"], color: "border-t-amber-400" },
  { id: "design", label: "Design", statuses: ["spec_generation"], color: "border-t-purple-400" },
  { id: "implementation", label: "Implementation", statuses: ["implementation"], color: "border-t-blue-400" },
  { id: "testing", label: "Testing", statuses: ["testing"], color: "border-t-cyan-400" },
  { id: "done", label: "Done", statuses: ["done"], color: "border-t-green-400" },
];

/** Reverse lookup: status → column id */
const STATUS_TO_COLUMN: Record<string, string> = {};
for (const col of KANBAN_COLUMNS) {
  for (const s of col.statuses) {
    STATUS_TO_COLUMN[s] = col.id;
  }
}

/** When moving to a column, which status to apply */
const COLUMN_TO_STATUS: Record<string, string> = {
  draft: "draft",
  triage_plan: "triage",
  design: "spec_generation",
  implementation: "implementation",
  testing: "testing",
  done: "done",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  low: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

const itemTypeIcons: Record<string, string> = {
  feature: "✨",
  bug: "🐛",
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${priorityColors[priority] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
    >
      {priority}
    </span>
  );
}

// =============================================================================
// STAGE-DEPENDENT AI ACTION CONFIGURATION
// =============================================================================

type AIActionConfig = {
  tool: "triage" | "aiDesign" | "aiImplement" | "aiTesting" | "aiSignoff";
  label: string;
  icon: string;
  description: string;
  nextStatus: string;
};

const STATUS_TO_AI_ACTION: Record<string, AIActionConfig> = {
  draft: {
    tool: "triage",
    label: "AI Triage",
    icon: "🎯",
    description: "Assess priority, effort, and risk",
    nextStatus: "triage",
  },
  triage: {
    tool: "aiDesign",
    label: "AI Design",
    icon: "📐",
    description: "Check duplicates, link docs, generate spec",
    nextStatus: "spec_generation",
  },
  backlog: {
    tool: "aiDesign",
    label: "AI Design",
    icon: "📐",
    description: "Check duplicates, link docs, generate spec",
    nextStatus: "spec_generation",
  },
  spec_generation: {
    tool: "aiImplement",
    label: "AI Implement",
    icon: "🔧",
    description: "Analyze impact and create task breakdown",
    nextStatus: "implementation",
  },
  implementation: {
    tool: "aiTesting",
    label: "AI Testing",
    icon: "🧪",
    description: "Generate test plan and acceptance criteria",
    nextStatus: "testing",
  },
  testing: {
    tool: "aiSignoff",
    label: "AI Signoff",
    icon: "✅",
    description: "Verify completeness and sign off",
    nextStatus: "done",
  },
};

// =============================================================================
// AI ACTION BUTTON (stage-aware, replaces TriageButton)
// =============================================================================

function AIActionButton({
  item,
  onItemUpdate,
}: {
  item: BacklogItemData;
  onItemUpdate: (itemId: string, updates: Partial<BacklogItemData>) => void;
}) {
  const status = item.item_status ?? item.status ?? "draft";
  const actionConfig = STATUS_TO_AI_ACTION[status];

  const { execute, isLoading } = useAIToolAction({
    onSuccess: (result) => {
      const data = result as Record<string, any>;
      const newStatus = data.newStatus as string | undefined;

      // Build optimistic updates
      const updates: Partial<BacklogItemData> = {};
      if (newStatus) {
        updates.item_status = newStatus;
      }

      // Auto-apply priority from triage
      if (data.triage?.suggestedPriority) {
        updates.item_priority = data.triage.suggestedPriority;
      }

      // Store AI metadata for popover
      updates.ai_metadata = {
        ...(item.ai_metadata || {}),
        ...(data.triage ? { triage: data.triage } : {}),
        ...(data.duplicateCheck !== undefined ? { duplicateCheck: { candidates: data.duplicateCheck } } : {}),
        ...(data.impact ? { impactAnalysis: data.impact } : {}),
        ...(data.testPlan ? { testPlan: data.testPlan } : {}),
        ...(data.signoff ? { signoff: data.signoff } : {}),
        ...(data.implementationPlan ? { implementationPlan: data.implementationPlan } : {}),
        ...(data.designPhase ? { designPhase: { ...data } } : {}),
      };

      onItemUpdate(item.id, updates);

      // Rich toast with key info
      const messages: string[] = [`"${item.item_title}" → ${newStatus ?? status}`];
      if (data.triage?.suggestedPriority) {
        messages.push(`Priority: ${data.triage.suggestedPriority}`);
      }
      if (data.specGenerated) {
        messages.push(`Spec generated: ${data.specTitle}`);
      }
      if (data.implementationPlan?.tasks?.length) {
        messages.push(`${data.implementationPlan.tasks.length} tasks created`);
      }
      if (data.testPlan?.scenarios?.length) {
        messages.push(`${data.testPlan.scenarios.length} test scenarios`);
      }
      if (data.signoff?.verdict) {
        messages.push(`Verdict: ${data.signoff.verdict}`);
      }
      toast.success(messages.join(" · "));
    },
  });

  // No action available for this status (e.g., "done")
  if (!actionConfig) return null;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await execute(actionConfig.tool, {
        itemType: item.item_type,
        itemId: item.item_id,
      });
    },
    [execute, actionConfig.tool, item.item_type, item.item_id]
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 shrink-0 disabled:opacity-50"
          disabled={isLoading}
          onClick={handleClick}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          {isLoading ? (
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-xs">{actionConfig.icon}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[200px]">
        <p className="font-medium text-xs">{actionConfig.label}</p>
        <p className="text-[10px] text-muted-foreground">{actionConfig.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// AI METADATA INDICATOR (shows popover with results)
// =============================================================================

function AIMetadataIndicator({
  aiMetadata,
  onOpenDetail,
}: {
  aiMetadata: Record<string, any>;
  onOpenDetail?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!aiMetadata || Object.keys(aiMetadata).length === 0) return null;

  const sections: { key: string; icon: string; label: string; content: React.ReactNode }[] = [];

  if (aiMetadata.triage) {
    sections.push({
      key: "triage",
      icon: "🎯",
      label: "Triage",
      content: (
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          {aiMetadata.triage.suggestedPriority && <div>Priority: <span className="font-medium capitalize">{aiMetadata.triage.suggestedPriority}</span></div>}
          {aiMetadata.triage.suggestedEffort && <div>Effort: <span className="font-medium">{aiMetadata.triage.suggestedEffort}</span></div>}
          {aiMetadata.triage.riskLevel && <div>Risk: <span className="font-medium capitalize">{aiMetadata.triage.riskLevel}</span></div>}
        </div>
      ),
    });
  }

  if (aiMetadata.duplicateCheck) {
    const count = aiMetadata.duplicateCheck.candidateCount ?? aiMetadata.duplicateCheck.candidates?.length ?? 0;
    sections.push({
      key: "duplicates",
      icon: "🔍",
      label: "Duplicates",
      content: <p className="text-[10px]">{count > 0 ? `${count} potential duplicate(s)` : "No duplicates found"}</p>,
    });
  }

  if (aiMetadata.suggestedLinks) {
    const count = aiMetadata.suggestedLinks.suggestionCount ?? aiMetadata.suggestedLinks.suggestions?.length ?? 0;
    sections.push({
      key: "links",
      icon: "📎",
      label: "Doc Links",
      content: <p className="text-[10px]">{count} link(s) suggested</p>,
    });
  }

  if (aiMetadata.specGeneration) {
    sections.push({
      key: "spec",
      icon: "📝",
      label: "Spec",
      content: <p className="text-[10px] truncate">{aiMetadata.specGeneration.specTitle ?? "Generated"}</p>,
    });
  }

  if (aiMetadata.impactAnalysis) {
    sections.push({
      key: "impact",
      icon: "💥",
      label: "Impact",
      content: (
        <div className="text-[10px]">
          {aiMetadata.impactAnalysis.overallRisk && (
            <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
              aiMetadata.impactAnalysis.overallRisk === "high" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              : aiMetadata.impactAnalysis.overallRisk === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
              : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
            }`}>{aiMetadata.impactAnalysis.overallRisk} risk</span>
          )}
        </div>
      ),
    });
  }

  if (aiMetadata.implementationPlan) {
    const taskCount = aiMetadata.implementationPlan.taskCount ?? aiMetadata.implementationPlan.tasks?.length ?? 0;
    sections.push({
      key: "impl",
      icon: "🔧",
      label: "Implementation",
      content: <p className="text-[10px]">{taskCount} task(s) planned</p>,
    });
  }

  if (aiMetadata.testPlan) {
    const scenarioCount = aiMetadata.testPlan.scenarioCount ?? aiMetadata.testPlan.scenarios?.length ?? 0;
    sections.push({
      key: "test",
      icon: "🧪",
      label: "Test Plan",
      content: <p className="text-[10px]">{scenarioCount} scenario(s)</p>,
    });
  }

  if (aiMetadata.signoff) {
    sections.push({
      key: "signoff",
      icon: "✅",
      label: "Signoff",
      content: (
        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
          aiMetadata.signoff.verdict === "approved"
            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        }`}>
          {aiMetadata.signoff.verdict}
        </span>
      ),
    });
  }

  if (sections.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="p-0.5 rounded hover:bg-muted/50 transition-colors text-[10px]"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        onPointerDown={(e) => e.stopPropagation()}
        title="AI Insights"
      >
        <SparklesIcon size={10} />
      </button>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
          {/* Popover */}
          <div
            className="absolute right-0 top-full mt-1 z-50 w-[220px] rounded-lg border bg-popover p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[11px] font-medium mb-1.5 text-muted-foreground">AI Insights</div>
            <div className="space-y-1.5">
              {sections.map((s) => (
                <div key={s.key} className="flex items-start gap-1.5">
                  <span className="text-[10px] mt-0.5 shrink-0">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium">{s.label}</div>
                    {s.content}
                  </div>
                </div>
              ))}
            </div>
            {onOpenDetail && (
              <button
                type="button"
                className="mt-2 w-full text-[10px] text-center py-1 rounded border border-dashed hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onOpenDetail();
                }}
              >
                View &amp; Edit Details →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// SORTABLE CARD
// =============================================================================

function SortableCard({
  item,
  isDragging,
  onItemUpdate,
  onOpenDetail,
}: {
  item: BacklogItemData;
  isDragging?: boolean;
  onItemUpdate: (itemId: string, updates: Partial<BacklogItemData>) => void;
  onOpenDetail: (item: BacklogItemData) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isSortDragging ? 0.4 : 1,
  };

  const priority = item.item_priority ?? item.priority ?? "medium";

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: "none" }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isSortDragging) onOpenDetail(item);
      }}
      className={`group flex flex-col gap-1.5 p-2.5 rounded-lg border bg-background shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
        isDragging ? "ring-2 ring-primary shadow-lg" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm shrink-0" title={item.item_type}>
          {itemTypeIcons[item.item_type] ?? "📌"}
        </span>
        <p className="text-xs font-medium truncate flex-1">
          {item.item_title ?? `${item.item_type} ${item.item_id.slice(0, 8)}`}
        </p>
        {item.ai_metadata && Object.keys(item.ai_metadata).length > 0 && (
          <AIMetadataIndicator
            aiMetadata={item.ai_metadata}
            onOpenDetail={() => onOpenDetail(item)}
          />
        )}
        <AIActionButton item={item} onItemUpdate={onItemUpdate} />
      </div>
      {item.item_description && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
          {item.item_description}
        </p>
      )}
      {(item.task_total ?? 0) > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.round(((item.task_done ?? 0) / item.task_total!) * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
            {item.task_done}/{item.task_total}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1 mt-0.5">
        <PriorityBadge priority={priority} />
        {item.sprint_label && (
          <span className="text-[10px] text-muted-foreground truncate">
            {item.sprint_label}
          </span>
        )}
      </div>
    </div>
  );
}

/** Overlay card rendered while dragging (follows pointer) */
function DragOverlayCard({ item }: { item: BacklogItemData }) {
  const priority = item.item_priority ?? item.priority ?? "medium";
  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border bg-background shadow-xl ring-2 ring-primary w-[220px]">
      <div className="flex items-center gap-1.5">
        <span className="text-sm shrink-0">{itemTypeIcons[item.item_type] ?? "📌"}</span>
        <p className="text-xs font-medium truncate flex-1">
          {item.item_title ?? `${item.item_type} ${item.item_id.slice(0, 8)}`}
        </p>
      </div>
      {item.item_description && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
          {item.item_description}
        </p>
      )}
      <div className="flex items-center gap-1 mt-0.5">
        <PriorityBadge priority={priority} />
      </div>
    </div>
  );
}

// =============================================================================
// KANBAN COLUMN
// =============================================================================

function KanbanColumn({
  column,
  items,
  onItemUpdate,
  onOpenDetail,
}: {
  column: (typeof KANBAN_COLUMNS)[number];
  items: BacklogItemData[];
  onItemUpdate: (itemId: string, updates: Partial<BacklogItemData>) => void;
  onOpenDetail: (item: BacklogItemData) => void;
}) {
  const { setNodeRef } = useSortable({
    id: `column-${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] max-w-[260px] w-full bg-muted/30 rounded-xl border border-t-4 ${column.color} shrink-0`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {column.label}
        </h4>
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
          {items.length}
        </span>
      </div>

      {/* Cards container */}
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1.5 p-2 overflow-y-auto flex-1 min-h-[80px]">
          {items.length === 0 && (
            <div className="flex items-center justify-center py-6 text-[10px] text-muted-foreground/60">
              Drop items here
            </div>
          )}
          {items.map((item) => (
            <SortableCard key={item.id} item={item} onItemUpdate={onItemUpdate} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// =============================================================================
// KANBAN BOARD (main component)
// =============================================================================

function BacklogKanbanView({ items: initialItems }: { items: BacklogItemData[] }) {
  const [items, setItems] = useState<BacklogItemData[]>(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  /** Track the original column & status when a drag starts so handleDragEnd
   *  can detect cross-column moves even after handleDragOver optimistically
   *  updates the item status. */
  const dragOriginRef = useRef<{ colId: string; status: string } | null>(null);

  // Sync local state when incoming items change (e.g. from streaming/refetch)
  const incomingIds = useMemo(
    () => initialItems.map((i) => i.id).join(","),
    [initialItems]
  );
  useEffect(() => {
    if (initialItems.length > 0) {
      setItems(initialItems);
    }
  }, [incomingIds]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Callback for AI action buttons to optimistically update items in-place */
  const handleAIActionUpdate = useCallback(
    (itemId: string, updates: Partial<BacklogItemData>) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, ...updates } : i
        )
      );
    },
    []
  );

  /** Open the feature/bug detail artifact view */
  const handleOpenDetail = useCallback(
    (item: BacklogItemData) => {
      const next: UIArtifact = {
        documentId: item.item_id,
        kind: item.item_type as "feature" | "bug",
        title: item.item_title ?? "",
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: { top: 0, left: 0, width: 0, height: 0 },
      };
      mutate("artifact", next, { revalidate: false });
    },
    [mutate]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** Group items by column */
  const columnItems = useMemo(() => {
    const grouped: Record<string, BacklogItemData[]> = {};
    for (const col of KANBAN_COLUMNS) {
      grouped[col.id] = [];
    }
    for (const item of items) {
      const status = item.item_status ?? item.status ?? "draft";
      const colId = STATUS_TO_COLUMN[status] ?? "draft";
      if (grouped[colId]) {
        grouped[colId].push(item);
      }
    }
    // Sort within each column by rank
    for (const colId of Object.keys(grouped)) {
      grouped[colId].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    }
    return grouped;
  }, [items]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  /** Find which column an item belongs to */
  const findColumnForItem = useCallback(
    (itemId: string): string | null => {
      for (const [colId, colItems] of Object.entries(columnItems)) {
        if (colItems.some((i) => i.id === itemId)) return colId;
      }
      return null;
    },
    [columnItems]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const itemId = event.active.id as string;
      setActiveId(itemId);

      // Snapshot the item's current column and status before any optimistic updates
      const item = items.find((i) => i.id === itemId);
      if (item) {
        const status = item.item_status ?? item.status ?? "draft";
        dragOriginRef.current = {
          colId: STATUS_TO_COLUMN[status] ?? "draft",
          status,
        };
      }
    },
    [items]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeItemId = active.id as string;
      const overId = over.id as string;

      // Determine source and destination columns
      const sourceCol = findColumnForItem(activeItemId);

      let destCol: string | null = null;
      if (overId.startsWith("column-")) {
        destCol = overId.replace("column-", "");
      } else {
        destCol = findColumnForItem(overId);
      }

      if (!sourceCol || !destCol || sourceCol === destCol) return;

      // Move the item to the new column optimistically
      setItems((prev) => {
        const item = prev.find((i) => i.id === activeItemId);
        if (!item) return prev;

        const newStatus = COLUMN_TO_STATUS[destCol!] ?? "draft";
        return prev.map((i) =>
          i.id === activeItemId
            ? { ...i, item_status: newStatus }
            : i
        );
      });
    },
    [findColumnForItem]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      // Retrieve the origin snapshot captured on drag start
      const origin = dragOriginRef.current;
      dragOriginRef.current = null;

      if (!over) return;

      const activeItemId = active.id as string;
      const overId = over.id as string;

      // Determine destination column
      let destCol: string | null = null;
      if (overId.startsWith("column-")) {
        destCol = overId.replace("column-", "");
      } else {
        destCol = findColumnForItem(overId);
      }

      if (!destCol) return;

      const item = items.find((i) => i.id === activeItemId);
      if (!item) return;

      // Use the pre-drag origin to detect cross-column moves, since
      // handleDragOver may have already updated item_status optimistically.
      const originColId = origin?.colId ?? (STATUS_TO_COLUMN[item.item_status ?? item.status ?? "draft"] ?? "draft");
      const originStatus = origin?.status ?? item.item_status ?? item.status ?? "draft";
      const newStatus = COLUMN_TO_STATUS[destCol] ?? "draft";

      // Cross-column move: update status in the backend
      if (originColId !== destCol) {
        try {
          const res = await fetch(`/api/backlog?id=${activeItemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "moveStatus", newStatus }),
          });
          if (!res.ok) {
            toast.error("Failed to update item status.");
            // Revert optimistic update back to original status
            setItems((prev) =>
              prev.map((i) =>
                i.id === activeItemId
                  ? { ...i, item_status: originStatus }
                  : i
              )
            );
            return;
          }
          toast.success(`Moved to ${KANBAN_COLUMNS.find((c) => c.id === destCol)?.label ?? destCol}`);
        } catch {
          toast.error("Network error updating status.");
          setItems((prev) =>
            prev.map((i) =>
              i.id === activeItemId
                ? { ...i, item_status: originStatus }
                : i
            )
          );
          return;
        }
      }

      // Within-column reorder: if dropping on another card in same column
      if (originColId === destCol && !overId.startsWith("column-") && overId !== activeItemId) {
        const colItems = [...(columnItems[destCol] ?? [])];
        const oldIndex = colItems.findIndex((i) => i.id === activeItemId);
        const newIndex = colItems.findIndex((i) => i.id === overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          // Reorder
          const [moved] = colItems.splice(oldIndex, 1);
          colItems.splice(newIndex, 0, moved);

          // Assign new ranks
          const rankUpdates = colItems.map((ci, idx) => ({
            id: ci.id,
            rank: idx + 1,
          }));

          // Optimistic update
          setItems((prev) => {
            const updated = [...prev];
            for (const ru of rankUpdates) {
              const idx = updated.findIndex((i) => i.id === ru.id);
              if (idx !== -1) {
                updated[idx] = { ...updated[idx], rank: ru.rank };
              }
            }
            return updated;
          });

          // Persist
          try {
            const res = await fetch("/api/backlog", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "bulkReorder", items: rankUpdates }),
            });
            if (!res.ok) {
              toast.error("Failed to reorder items.");
            }
          } catch {
            toast.error("Network error during reorder.");
          }
        }
      }
    },
    [items, columnItems, findColumnForItem]
  );

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-medium mb-2">Backlog is empty</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create features or bugs to automatically add them to the backlog.
          Ask AI to help triage and prioritize items.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Product Backlog
        </h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {items.length} items
        </span>
      </div>

      {/* Kanban board */}
      <TooltipProvider delayDuration={300}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 p-4 overflow-x-auto overflow-y-hidden flex-1">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              items={columnItems[col.id] ?? []}
              onItemUpdate={handleAIActionUpdate}
              onOpenDetail={handleOpenDetail}
            />
          ))}
        </div>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              {activeItem ? <DragOverlayCard item={activeItem} /> : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
      </TooltipProvider>
    </div>
  );
}

// =============================================================================
// BACKLOG CONTENT — re-fetches when selected repository changes
// =============================================================================

function BacklogContentWithRepo({
  content,
}: {
  content: string;
}) {
  const { selectedRepositoryId } = useSelectedRepository();
  const [items, setItems] = useState<BacklogItemData[] | null>(() => {
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch {
      return null;
    }
  });
  const hasFetchedRef = useRef(false);

  // Re-fetch backlog when selected repository changes (and on mount)
  useEffect(() => {
    const repoParam = selectedRepositoryId
      ? `?repositoryId=${selectedRepositoryId}`
      : "";
    fetch(`/api/backlog${repoParam}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          hasFetchedRef.current = true;
          setItems(data);
        }
      })
      .catch(() => {});
  }, [selectedRepositoryId]);

  // Sync from streaming content updates (only before first repo fetch)
  useEffect(() => {
    if (hasFetchedRef.current) return;
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data) && data.length > 0) {
        setItems(data);
      }
    } catch {
      // ignore
    }
  }, [content]);

  if (items === null) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Unable to parse backlog data.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <BacklogKanbanView items={items} />
    </div>
  );
}

export const backlogArtifact = new Artifact<"backlog", BacklogArtifactMetadata>(
  {
    kind: "backlog",
    description:
      "Product backlog view — a prioritized list of features and bugs ready for development.",

    initialize: async ({ setMetadata, setArtifact }) => {
      setMetadata({
        isRefreshing: false,
      });

      // Set empty content so the component mounts and handles its own
      // repo-aware fetching via useSelectedRepository()
      setArtifact((current) => ({
        ...current,
        content: current.content || "[]",
      }));
    },

    onStreamPart: ({ streamPart, setArtifact }) => {
      if (streamPart.type === "data-backlogDelta") {
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

      return <BacklogContentWithRepo content={content} />;
    },

    actions: [
      {
        icon: <CopyIcon size={18} />,
        description: "Copy backlog summary",
        onClick: ({ content }) => {
          try {
            const items = JSON.parse(content) as BacklogItemData[];
            const text = items
              .map(
                (item, i) =>
                  `${i + 1}. [${item.item_type}] ${item.item_title ?? item.item_id} — ${item.priority ?? "medium"}`
              )
              .join("\n");
            navigator.clipboard.writeText(
              `Product Backlog (${items.length} items)\n\n${text}`
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
        description: "AI Prioritize backlog",
        immediate: true,
        onClick: ({ sendMessage }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: "Please use the viewBacklog tool to get the current backlog, then analyze and suggest a better prioritization based on impact, urgency, and dependencies.",
              },
            ],
          });
        },
      },
      {
        icon: <SparklesIcon />,
        description: "Triage all un-triaged items",
        immediate: true,
        onClick: ({ sendMessage }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: "Please use the viewBacklog tool to get the current backlog, then triage all features and bugs that have not been triaged yet. Use the triageItem tool for each one.",
              },
            ],
          });
        },
      },
      {
        icon: <MessageIcon />,
        description: "Sprint planning help",
        immediate: true,
        onClick: ({ sendMessage }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: "Please use the viewBacklog tool to get the current backlog, then help me plan the next sprint. Suggest which backlog items to include based on priority and estimated effort.",
              },
            ],
          });
        },
      },
    ],
  }
);
