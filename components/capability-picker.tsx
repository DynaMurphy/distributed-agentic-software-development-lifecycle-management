"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { LayersIcon, PlusIcon, XIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { fetcher } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface CapabilitySummary {
  id: string;
  name: string;
  sdlc_phase: string;
  sort_order: number;
  status: string;
  feature_count: number;
  bug_count: number;
  task_count: number;
}

interface ItemCapability {
  id: string;
  name: string;
  sdlc_phase: string;
  link_id: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SDLC_PHASE_COLORS: Record<string, string> = {
  strategy_planning: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  prioritization: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  specification: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  implementation: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  verification: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  delivery: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  post_delivery: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  platform: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const SDLC_PHASE_LABELS: Record<string, string> = {
  strategy_planning: "Strategy & Planning",
  prioritization: "Prioritization",
  specification: "Specification",
  implementation: "Implementation",
  verification: "Verification",
  delivery: "Delivery",
  post_delivery: "Post-Delivery",
  platform: "Platform",
};

// =============================================================================
// CAPABILITY BADGE (clickable)
// =============================================================================

function CapabilityBadge({
  name,
  sdlcPhase,
  onRemove,
}: {
  name: string;
  sdlcPhase: string;
  onRemove?: () => void;
}) {
  const colorClass = SDLC_PHASE_COLORS[sdlcPhase] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      <LayersIcon className="size-3" />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}

// =============================================================================
// CAPABILITY PICKER COMPONENT
// =============================================================================

/**
 * Displays assigned capabilities for a feature/bug and allows adding/removing
 * capability assignments when in edit mode.
 */
export function CapabilityPicker({
  itemType,
  itemId,
  isEditable = false,
}: {
  itemType: "feature" | "bug";
  itemId: string;
  isEditable?: boolean;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Fetch current capabilities for this item
  const {
    data: assignedCaps,
    isLoading: isLoadingAssigned,
    mutate: mutateAssigned,
  } = useSWR<ItemCapability[]>(
    `/api/capabilities?itemType=${itemType}&itemId=${itemId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Fetch all active capabilities (only when picker is open)
  const { data: allCaps } = useSWR<CapabilitySummary[]>(
    isPickerOpen ? "/api/capabilities?status=active" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const assignedIds = new Set(assignedCaps?.map((c) => c.id) ?? []);

  // Filter available capabilities
  const availableCaps = (allCaps ?? []).filter(
    (c) =>
      !assignedIds.has(c.id) &&
      (searchQuery === "" ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group available by SDLC phase
  const groupedAvailable: Record<string, CapabilitySummary[]> = {};
  for (const cap of availableCaps) {
    const phase = cap.sdlc_phase || "platform";
    if (!groupedAvailable[phase]) groupedAvailable[phase] = [];
    groupedAvailable[phase].push(cap);
  }
  const sortedPhases = Object.keys(groupedAvailable).sort(
    (a, b) => (phaseOrder[a] ?? 99) - (phaseOrder[b] ?? 99)
  );

  const handleAssign = useCallback(
    async (capabilityId: string) => {
      setIsAssigning(true);
      try {
        const res = await fetch("/api/capabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capabilityId, itemType, itemId }),
        });
        if (!res.ok) throw new Error("Failed to assign");
        toast.success("Capability assigned");
        mutateAssigned();
      } catch {
        toast.error("Failed to assign capability");
      } finally {
        setIsAssigning(false);
      }
    },
    [itemType, itemId, mutateAssigned]
  );

  const handleUnassign = useCallback(
    async (linkId: string) => {
      try {
        const res = await fetch(`/api/capabilities?linkId=${linkId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to unassign");
        toast.success("Capability removed");
        mutateAssigned();
      } catch {
        toast.error("Failed to remove capability");
      }
    },
    [mutateAssigned]
  );

  if (isLoadingAssigned) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <LayersIcon className="size-3.5" />
          Capabilities
        </label>
        <div className="h-8 rounded-md bg-muted/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <LayersIcon className="size-3.5" />
        Capabilities
      </label>

      {/* Assigned capabilities */}
      <div className="flex flex-wrap gap-1.5">
        {assignedCaps && assignedCaps.length > 0 ? (
          assignedCaps.map((cap) => (
            <CapabilityBadge
              key={cap.link_id}
              name={cap.name}
              sdlcPhase={cap.sdlc_phase}
              onRemove={isEditable ? () => handleUnassign(cap.link_id) : undefined}
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground italic">
            No capabilities assigned
          </span>
        )}

        {/* Add button */}
        {isEditable && (
          <button
            type="button"
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <PlusIcon className="size-3" />
            Add
          </button>
        )}
      </div>

      {/* Picker dropdown */}
      {isPickerOpen && isEditable && (
        <div className="border rounded-lg bg-popover shadow-md overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
              placeholder="Search capabilities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setIsPickerOpen(false);
                setSearchQuery("");
              }}
              className="p-0.5 rounded hover:bg-muted transition-colors"
            >
              <XIcon className="size-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Grouped capability list */}
          <div className="max-h-[240px] overflow-y-auto">
            {sortedPhases.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {allCaps ? "All capabilities assigned" : "Loading…"}
              </div>
            ) : (
              sortedPhases.map((phase) => (
                <PhaseGroup
                  key={phase}
                  phase={phase}
                  capabilities={groupedAvailable[phase]}
                  onAssign={handleAssign}
                  isAssigning={isAssigning}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Phase ordering for display
const phaseOrder: Record<string, number> = {
  strategy_planning: 0,
  prioritization: 1,
  specification: 2,
  implementation: 3,
  verification: 4,
  delivery: 5,
  post_delivery: 6,
  platform: 7,
};

function PhaseGroup({
  phase,
  capabilities,
  onAssign,
  isAssigning,
}: {
  phase: string;
  capabilities: CapabilitySummary[];
  onAssign: (capId: string) => void;
  isAssigning: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        {SDLC_PHASE_LABELS[phase] ?? phase}
        <span className="ml-auto text-muted-foreground/60">
          {capabilities.length}
        </span>
      </button>
      {isExpanded && (
        <div>
          {capabilities.map((cap) => (
            <button
              key={cap.id}
              type="button"
              disabled={isAssigning}
              onClick={() => onAssign(cap.id)}
              className="flex items-center gap-2 w-full px-5 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
            >
              <LayersIcon className="size-3 text-muted-foreground shrink-0" />
              <span className="flex-1 text-left truncate">{cap.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {cap.feature_count}f {cap.bug_count}b
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CAPABILITY FILTER (for browser views)
// =============================================================================

/**
 * A multi-select capability filter that can be used in features/bugs browser views.
 * Returns the selected capability IDs.
 */
export function CapabilityFilter({
  selectedIds,
  onChange,
  itemType,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  itemType?: "feature" | "bug";
}) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: capabilities } = useSWR<CapabilitySummary[]>(
    "/api/capabilities?status=active",
    fetcher,
    { revalidateOnFocus: false }
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const hasSelection = selectedIds.length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          hasSelection
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 text-muted-foreground hover:bg-muted"
        }`}
      >
        <LayersIcon className="size-3" />
        Capability
        {hasSelection && (
          <span className="bg-primary-foreground/20 px-1.5 rounded-full text-[10px]">
            {selectedIds.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-50 w-[240px] rounded-lg border bg-popover shadow-lg overflow-hidden">
            <div className="max-h-[280px] overflow-y-auto py-1">
              {/* Ungrouped option */}
              <button
                type="button"
                onClick={() => toggle("ungrouped")}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                <span
                  className={`size-3 rounded border flex items-center justify-center ${
                    selectedIds.includes("ungrouped")
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {selectedIds.includes("ungrouped") && (
                    <span className="text-[8px]">✓</span>
                  )}
                </span>
                <span className="italic text-muted-foreground">Ungrouped</span>
              </button>

              <div className="border-t my-1" />

              {/* Capability options */}
              {(capabilities ?? []).map((cap) => (
                <button
                  key={cap.id}
                  type="button"
                  onClick={() => toggle(cap.id)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                >
                  <span
                    className={`size-3 rounded border flex items-center justify-center ${
                      selectedIds.includes(cap.id)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {selectedIds.includes(cap.id) && (
                      <span className="text-[8px]">✓</span>
                    )}
                  </span>
                  <span className="flex-1 text-left truncate">{cap.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {itemType === "feature" ? cap.feature_count : itemType === "bug" ? cap.bug_count : cap.feature_count + cap.bug_count}
                  </span>
                </button>
              ))}
            </div>

            {hasSelection && (
              <div className="border-t px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange([]);
                    setIsOpen(false);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
