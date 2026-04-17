"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
  SparklesIcon,
  BugIcon,
  PlusIcon,
  XIcon,
  SearchIcon,
} from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import { CopyIcon, EyeIcon, MessageIcon, PenIcon, SaveIcon, SparklesIcon as SparklesIconCustom } from "@/components/icons";
import { MilkdownFieldEditor } from "@/components/milkdown-field-editor";
import { SpecViewer } from "@/components/spec-viewer";
import { Badge } from "@/components/ui/badge";
import { useArtifact } from "@/hooks/use-artifact";
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

interface CapabilityDetail {
  id: string;
  version_id: string;
  name: string;
  description: string | null;
  sdlc_phase: string;
  sort_order: number;
  status: string;
  valid_from: string;
}

interface CapabilityItems {
  features: { id: string; title: string; status: string; priority: string; feature_type: string }[];
  bugs: { id: string; title: string; status: string; severity: string; priority: string }[];
}

type CapabilityArtifactMetadata = {
  capabilityId: string | null;
  isEditing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  /** When set, shows the refine-description wizard overlay */
  refineWizard: RefineWizardState | null;
};

// =============================================================================
// CONSTANTS
// =============================================================================

const SDLC_PHASES: { value: string; label: string; emoji: string }[] = [
  { value: "strategy_planning", label: "Strategy & Planning", emoji: "🎯" },
  { value: "prioritization", label: "Prioritization", emoji: "📊" },
  { value: "specification", label: "Specification", emoji: "📝" },
  { value: "implementation", label: "Implementation", emoji: "⚙️" },
  { value: "verification", label: "Verification", emoji: "✅" },
  { value: "delivery", label: "Delivery", emoji: "🚀" },
  { value: "post_delivery", label: "Post-Delivery", emoji: "📚" },
  { value: "platform", label: "Platform", emoji: "🏗️" },
];

const phaseLabel = (phase: string) =>
  SDLC_PHASES.find((p) => p.value === phase)?.label ?? phase;

const phaseEmoji = (phase: string) =>
  SDLC_PHASES.find((p) => p.value === phase)?.emoji ?? "📦";

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

const severityColors: Record<string, string> = {
  blocker: "bg-red-900 text-white",
  critical: "bg-red-200 text-red-800",
  major: "bg-orange-200 text-orange-800",
  minor: "bg-yellow-200 text-yellow-800",
  trivial: "bg-gray-200 text-gray-800",
};

// =============================================================================
// HEALTH SCORING
// =============================================================================

function getHealthIndicator(cap: CapabilitySummary): { color: string; label: string } {
  const total = cap.feature_count + cap.bug_count;
  if (total === 0) return { color: "bg-red-500", label: "No items" };
  const bugRatio = cap.bug_count / total;
  if (bugRatio > 0.5) return { color: "bg-red-500", label: "High bug ratio" };
  if (cap.feature_count === 0) return { color: "bg-yellow-500", label: "Bugs only" };
  if (bugRatio > 0.3) return { color: "bg-yellow-500", label: "Moderate bugs" };
  return { color: "bg-green-500", label: "Healthy" };
}

// =============================================================================
// REFINE DESCRIPTION WIZARD — Dynamic AI-generated questionnaire
// =============================================================================

interface WizardStepOption {
  label: string;
  value: string;
}

interface WizardStep {
  id: string;
  title: string;
  question: string;
  options: WizardStepOption[];
  multiSelect: boolean;
}

const TOTAL_WIZARD_STEPS = 5;

interface RefineWizardState {
  currentStep: number;
  totalSteps: number;
  answers: Record<string, { selected: string[]; freeText: string }>;
  steps: Record<number, WizardStep>;
  isLoadingStep: boolean;
  capabilityName: string;
  capabilityId: string;
  sdlcPhase: string;
  currentDescription: string;
}

function RefineDescriptionWizard({
  state,
  setMetadata,
  sendMessage,
}: {
  state: RefineWizardState;
  setMetadata: React.Dispatch<React.SetStateAction<CapabilityArtifactMetadata>>;
  sendMessage: (message: { role: string; parts: { type: string; text: string }[] }) => void;
}) {
  const step = state.steps[state.currentStep];
  const currentAnswer = step
    ? (state.answers[step.id] ?? { selected: [], freeText: "" })
    : { selected: [], freeText: "" };
  const totalSteps = state.totalSteps;
  const isLastStep = state.currentStep === totalSteps - 1;

  // Track whether a fetch is in-flight to avoid duplicate requests
  const fetchingStepRef = useRef<number | null>(null);
  // Keep latest state in a ref so the effect closure always reads fresh values
  const stateRef = useRef(state);
  stateRef.current = state;

  // Fetch the current step dynamically when it's not yet loaded
  const stepLoaded = !!state.steps[state.currentStep];
  const { currentStep } = state;

  useEffect(() => {
    if (stepLoaded || fetchingStepRef.current === currentStep) return;

    fetchingStepRef.current = currentStep;
    setMetadata((prev) => {
      if (!prev.refineWizard) return prev;
      return { ...prev, refineWizard: { ...prev.refineWizard, isLoadingStep: true } };
    });

    const s = stateRef.current;
    fetch("/api/capabilities/wizard-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stepIndex: currentStep,
        capabilityName: s.capabilityName,
        capabilityDescription: s.currentDescription,
        sdlcPhase: s.sdlcPhase,
        previousAnswers: s.answers,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        fetchingStepRef.current = null;
        setMetadata((prev) => {
          if (!prev.refineWizard) return prev;
          return {
            ...prev,
            refineWizard: {
              ...prev.refineWizard,
              isLoadingStep: false,
              steps: {
                ...prev.refineWizard.steps,
                [currentStep]: data.step,
              },
            },
          };
        });
      })
      .catch(() => {
        fetchingStepRef.current = null;
        toast.error("Failed to generate wizard step");
        setMetadata((prev) => {
          if (!prev.refineWizard) return prev;
          return { ...prev, refineWizard: { ...prev.refineWizard, isLoadingStep: false } };
        });
      });

    // No cleanup needed — ref guards against duplicate fetches
  }, [currentStep, stepLoaded, setMetadata]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOption = useCallback(
    (value: string) => {
      setMetadata((prev) => {
        if (!prev.refineWizard) return prev;
        const currentStep = prev.refineWizard.steps[prev.refineWizard.currentStep];
        if (!currentStep) return prev;
        const stepId = currentStep.id;
        const answer = prev.refineWizard.answers[stepId] ?? { selected: [], freeText: "" };
        const selected = answer.selected.includes(value)
          ? answer.selected.filter((v) => v !== value)
          : currentStep.multiSelect
            ? [...answer.selected, value]
            : [value];
        return {
          ...prev,
          refineWizard: {
            ...prev.refineWizard,
            answers: {
              ...prev.refineWizard.answers,
              [stepId]: { ...answer, selected },
            },
          },
        };
      });
    },
    [setMetadata],
  );

  const setFreeText = useCallback(
    (text: string) => {
      setMetadata((prev) => {
        if (!prev.refineWizard) return prev;
        const currentStep = prev.refineWizard.steps[prev.refineWizard.currentStep];
        if (!currentStep) return prev;
        const stepId = currentStep.id;
        const answer = prev.refineWizard.answers[stepId] ?? { selected: [], freeText: "" };
        return {
          ...prev,
          refineWizard: {
            ...prev.refineWizard,
            answers: {
              ...prev.refineWizard.answers,
              [stepId]: { ...answer, freeText: text },
            },
          },
        };
      });
    },
    [setMetadata],
  );

  const goNext = useCallback(() => {
    if (!step) return;

    if (isLastStep) {
      // Compile answers and send to AI
      const answers = { ...state.answers, [step.id]: currentAnswer };
      const sections = Object.values(state.steps)
        .map((s) => {
          const a = answers[s.id] ?? { selected: [], freeText: "" };
          const parts: string[] = [];
          if (a.selected.length > 0) parts.push(a.selected.join(", "));
          if (a.freeText.trim()) parts.push(a.freeText.trim());
          return `### ${s.title}\n**Q:** ${s.question}\n**A:** ${parts.join("\n\nAdditional context: ")}`;
        })
        .join("\n\n");

      const prompt = `I want to refine the description of the capability "${state.capabilityName}" (ID: ${state.capabilityId}, SDLC Phase: ${state.sdlcPhase}).

Here is the current description:
${state.currentDescription || "No description yet."}

I've answered a questionnaire about this capability. Use my answers below to generate a comprehensive, well-structured description in markdown. The description should cover: Purpose, Scope, Success Criteria, Dependencies, and Current State.

${sections}

Please generate the refined description and then update the capability using the appropriate tool. Format the description with clear markdown sections.`;

      sendMessage({
        role: "user",
        parts: [{ type: "text", text: prompt }],
      });

      // Close the wizard
      setMetadata((prev) => ({ ...prev, refineWizard: null }));
      return;
    }

    // Move to next step — clear the cached step for next index so it gets
    // freshly generated with the latest answers
    setMetadata((prev) => {
      if (!prev.refineWizard) return prev;
      const nextStep = prev.refineWizard.currentStep + 1;
      const { [nextStep]: _removed, ...remainingSteps } = prev.refineWizard.steps;
      return {
        ...prev,
        refineWizard: {
          ...prev.refineWizard,
          currentStep: nextStep,
          steps: remainingSteps,
        },
      };
    });
  }, [isLastStep, state, step, currentAnswer, setMetadata, sendMessage]);

  const goBack = useCallback(() => {
    setMetadata((prev) => {
      if (!prev.refineWizard) return prev;
      if (prev.refineWizard.currentStep === 0) {
        return { ...prev, refineWizard: null };
      }
      return {
        ...prev,
        refineWizard: {
          ...prev.refineWizard,
          currentStep: prev.refineWizard.currentStep - 1,
        },
      };
    });
  }, [setMetadata]);

  const hasAnswer = currentAnswer.selected.length > 0 || currentAnswer.freeText.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Refine Description</h2>
          <p className="text-xs text-muted-foreground">
            {state.capabilityName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Step {state.currentStep + 1} of {totalSteps}
          </Badge>
          <button
            type="button"
            onClick={() => setMetadata((prev) => ({ ...prev, refineWizard: null }))}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-4">
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < state.currentStep
                  ? "bg-primary"
                  : i === state.currentStep
                    ? "bg-primary/60"
                    : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {state.isLoadingStep || !step ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SparklesIcon className="size-4 animate-pulse" />
              Generating tailored questions...
            </div>
            <div className="space-y-3 w-full animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="space-y-2 pt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 bg-muted rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-base font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{step.question}</p>
              {step.multiSelect && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select all that apply
                </p>
              )}
            </div>

            {/* Options */}
            <div className="space-y-2">
              {step.options.map((opt) => {
                const isSelected = currentAnswer.selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    className={`flex w-full items-center gap-3 px-4 py-3 rounded-lg border text-left text-sm transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                        : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-accent/50"
                    }`}
                  >
                    <span
                      className={`flex shrink-0 items-center justify-center size-5 rounded ${
                        step.multiSelect ? "rounded" : "rounded-full"
                      } border-2 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && (
                        <svg className="size-3" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Free text */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Additional context (optional)
              </label>
              <textarea
                value={currentAnswer.freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Add your own thoughts or details..."
                className="w-full min-h-[80px] rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t px-6 py-4">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRightIcon className="size-4 rotate-180" />
          {state.currentStep === 0 ? "Cancel" : "Back"}
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!hasAnswer || state.isLoadingStep || !step}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            hasAnswer && !state.isLoadingStep && step
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {isLastStep ? (
            <>
              <SparklesIcon className="size-4" />
              Generate with AI
            </>
          ) : (
            <>
              Next
              <ChevronRightIcon className="size-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// BROWSER VIEW — Capabilities grouped by SDLC phase
// =============================================================================

function CapabilitiesBrowserView({
  setMetadata,
}: {
  setMetadata: React.Dispatch<React.SetStateAction<CapabilityArtifactMetadata>>;
}) {
  const { setArtifact } = useArtifact();
  const { selectedRepositoryId } = useSelectedRepository();
  const repoParam = selectedRepositoryId
    ? `?productId=${selectedRepositoryId}`
    : "";
  const { data: capabilities, isLoading } = useSWR<CapabilitySummary[]>(
    `/api/capabilities${repoParam}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(
    SDLC_PHASES.map((p) => p.value)
  ));

  const togglePhase = useCallback((phase: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  const handleOpen = useCallback(
    (cap: CapabilitySummary) => {
      setMetadata({ capabilityId: cap.id, isEditing: false, isDirty: false, isSaving: false, refineWizard: null });
      setArtifact((current) => ({
        ...current,
        documentId: cap.id,
        title: cap.name,
        content: "",
      }));
    },
    [setMetadata, setArtifact],
  );

  if (isLoading) return <DocumentSkeleton artifactKind="text" />;

  // Group by SDLC phase
  const grouped = new Map<string, CapabilitySummary[]>();
  for (const phase of SDLC_PHASES) {
    grouped.set(phase.value, []);
  }
  for (const cap of capabilities ?? []) {
    const list = grouped.get(cap.sdlc_phase) ?? [];
    list.push(cap);
    grouped.set(cap.sdlc_phase, list);
  }

  const totalItems = (capabilities ?? []).reduce(
    (sum, c) => sum + c.feature_count + c.bug_count + c.task_count,
    0,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <LayersIcon className="size-5" />
          <div>
            <h2 className="text-lg font-semibold">Capabilities</h2>
            <p className="text-xs text-muted-foreground">
              SDLC capability areas with grouped features &amp; bugs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {capabilities?.length ?? 0} capabilities
          </Badge>
          <Badge variant="outline">{totalItems} items</Badge>
        </div>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto">
        {SDLC_PHASES.map((phase) => {
          const caps = grouped.get(phase.value) ?? [];
          const isExpanded = expandedPhases.has(phase.value);
          const phaseItemCount = caps.reduce(
            (s, c) => s + c.feature_count + c.bug_count + c.task_count,
            0,
          );

          return (
            <div key={phase.value} className="border-b last:border-b-0">
              {/* Phase header */}
              <button
                type="button"
                onClick={() => togglePhase(phase.value)}
                className="flex w-full items-center gap-2 px-6 py-2.5 text-left hover:bg-accent/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm">{phase.emoji}</span>
                <span className="text-sm font-medium flex-1">
                  {phase.label}
                </span>
                <Badge variant="outline" className="text-xs">
                  {phaseItemCount}
                </Badge>
              </button>

              {/* Capabilities in phase */}
              {isExpanded && (
                <div className="pb-1">
                  {caps.length === 0 ? (
                    <div className="px-12 py-2 text-xs text-muted-foreground italic">
                      No capabilities in this phase
                    </div>
                  ) : (
                    caps.map((cap) => {
                      const health = getHealthIndicator(cap);
                      const itemCount =
                        cap.feature_count + cap.bug_count + cap.task_count;

                      return (
                        <button
                          key={cap.id}
                          type="button"
                          onClick={() => handleOpen(cap)}
                          className="flex w-full items-center gap-3 pl-12 pr-6 py-2 text-left transition-colors hover:bg-accent"
                        >
                          {/* Health dot */}
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${health.color}`}
                            title={health.label}
                          />

                          {/* Name */}
                          <span className="flex-1 truncate text-sm">
                            {cap.name}
                          </span>

                          {/* Counts */}
                          {cap.feature_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <SparklesIcon className="size-3" />
                              {cap.feature_count}
                            </span>
                          )}
                          {cap.bug_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <BugIcon className="size-3" />
                              {cap.bug_count}
                            </span>
                          )}

                          {/* Item count badge (dimmed if zero) */}
                          <Badge
                            variant="outline"
                            className={`text-xs ${itemCount === 0 ? "opacity-40" : ""}`}
                          >
                            {itemCount}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// DETAIL VIEW — Shows a single capability with view/edit modes
// =============================================================================

/** Search picker for assigning features or bugs */
function ItemAssignmentPicker({
  capabilityId,
  itemType,
  existingIds,
  onAssigned,
}: {
  capabilityId: string;
  itemType: "feature" | "bug";
  existingIds: Set<string>;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);

  const endpoint = itemType === "feature" ? "/api/features" : "/api/bugs";
  const { data: allItems } = useSWR<{ id: string; title: string; status: string }[]>(
    isOpen ? endpoint : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const filtered = (allItems ?? []).filter(
    (item) =>
      !existingIds.has(item.id) &&
      item.title.toLowerCase().includes(query.toLowerCase()),
  );

  const handleAssign = useCallback(
    async (itemId: string) => {
      setIsAssigning(itemId);
      try {
        const res = await fetch("/api/capabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capabilityId, itemType, itemId }),
        });
        if (!res.ok) throw new Error("Failed to assign");
        toast.success(`${itemType === "feature" ? "Feature" : "Bug"} assigned`);
        onAssigned();
        setQuery("");
      } catch {
        toast.error(`Failed to assign ${itemType}`);
      } finally {
        setIsAssigning(null);
      }
    },
    [capabilityId, itemType, onAssigned],
  );

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-dashed hover:border-solid"
      >
        <PlusIcon className="size-3" />
        Assign {itemType}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border p-2 bg-muted/10">
      <div className="flex items-center gap-2">
        <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${itemType}s...`}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setIsOpen(false); setQuery(""); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-1 py-2">
            {allItems ? "No matching items" : "Loading..."}
          </div>
        ) : (
          filtered.slice(0, 20).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isAssigning === item.id}
              onClick={() => handleAssign(item.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              {itemType === "feature" ? (
                <SparklesIcon className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <BugIcon className="size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{item.title}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[item.status] ?? "bg-gray-100 text-gray-600"}`}>
                {item.status.replace(/_/g, " ")}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Unassign button for an item */
function UnassignButton({
  capabilityId,
  itemType,
  itemId,
  onUnassigned,
}: {
  capabilityId: string;
  itemType: "feature" | "bug";
  itemId: string;
  onUnassigned: () => void;
}) {
  const [isUnassigning, setIsUnassigning] = useState(false);

  // We need to look up the link_id. The API returns items, but we need the capability_items link.
  const handleUnassign = useCallback(async () => {
    setIsUnassigning(true);
    try {
      // First get the link ID for this item
      const res = await fetch(
        `/api/capabilities?itemType=${itemType}&itemId=${itemId}`,
      );
      if (!res.ok) throw new Error("Failed to find link");
      const caps: { id: string; link_id: string }[] = await res.json();
      const link = caps.find((c) => c.id === capabilityId);
      if (!link) throw new Error("Link not found");

      const delRes = await fetch(`/api/capabilities?linkId=${link.link_id}`, {
        method: "DELETE",
      });
      if (!delRes.ok) throw new Error("Failed to unassign");
      toast.success("Item unassigned");
      onUnassigned();
    } catch {
      toast.error("Failed to unassign item");
    } finally {
      setIsUnassigning(false);
    }
  }, [capabilityId, itemType, itemId, onUnassigned]);

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); handleUnassign(); }}
      disabled={isUnassigning}
      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      title="Unassign"
    >
      <XIcon className="size-3.5" />
    </button>
  );
}

function CapabilityDetailView({
  capabilityId,
  isEditing,
  setMetadata,
}: {
  capabilityId: string;
  isEditing: boolean;
  setMetadata: React.Dispatch<React.SetStateAction<CapabilityArtifactMetadata>>;
}) {
  const { setArtifact } = useArtifact();
  const { data: capability, isLoading: isLoadingCap, mutate: mutateCap } = useSWR<CapabilityDetail>(
    `/api/capabilities?id=${capabilityId}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: items, isLoading: isLoadingItems, mutate: mutateItems } = useSWR<CapabilityItems>(
    `/api/capabilities?id=${capabilityId}&items=true`,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Edit state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPhase, setEditPhase] = useState("");
  const [editStatus, setEditStatus] = useState("");

  // Initialize edit state when capability loads or edit mode toggles
  useEffect(() => {
    if (capability) {
      setEditName(capability.name);
      setEditDescription(capability.description ?? "");
      setEditPhase(capability.sdlc_phase);
      setEditStatus(capability.status);
    }
  }, [capability]);

  const handleSave = useCallback(async () => {
    if (!capability) return;
    setMetadata((prev) => ({ ...prev, isSaving: true }));
    try {
      const res = await fetch("/api/capabilities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: capabilityId,
          name: editName !== capability.name ? editName : undefined,
          description: editDescription !== (capability.description ?? "") ? editDescription : undefined,
          sdlc_phase: editPhase !== capability.sdlc_phase ? editPhase : undefined,
          status: editStatus !== capability.status ? editStatus : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Capability saved");
      setMetadata((prev) => ({ ...prev, isDirty: false, isSaving: false, isEditing: false }));
      mutateCap();
      // Also refresh the browser list
      mutate("/api/capabilities");
    } catch {
      toast.error("Failed to save capability");
      setMetadata((prev) => ({ ...prev, isSaving: false }));
    }
  }, [capability, capabilityId, editName, editDescription, editPhase, editStatus, setMetadata, mutateCap]);

  // Listen for save event from the action bar button
  useEffect(() => {
    const handler = () => { handleSave(); };
    window.addEventListener("capability-save", handler);
    return () => window.removeEventListener("capability-save", handler);
  }, [handleSave]);

  const handleRefreshItems = useCallback(() => {
    mutateItems();
    // Also refresh the browser list counts
    mutate("/api/capabilities");
  }, [mutateItems]);

  const openFeature = useCallback(
    (id: string, title: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: id,
        kind: "feature" as const,
        title,
        content: "",
        isVisible: true,
        status: "idle",
      }));
    },
    [setArtifact],
  );

  const openBug = useCallback(
    (id: string, title: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: id,
        kind: "bug" as const,
        title,
        content: "",
        isVisible: true,
        status: "idle",
      }));
    },
    [setArtifact],
  );

  if (isLoadingCap || isLoadingItems) {
    return <DocumentSkeleton artifactKind="text" />;
  }

  if (!capability) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Capability not found.
      </div>
    );
  }

  const features = items?.features ?? [];
  const bugs = items?.bugs ?? [];
  const existingFeatureIds = new Set(features.map((f) => f.id));
  const existingBugIds = new Set(bugs.map((b) => b.id));
  const health = getHealthIndicator({
    ...capability,
    feature_count: features.length,
    bug_count: bugs.length,
    task_count: 0,
  } as CapabilitySummary);

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Capability
            </span>
            {isEditing ? (
              <select
                value={editPhase}
                onChange={(e) => {
                  setEditPhase(e.target.value);
                  setMetadata((prev) => ({ ...prev, isDirty: true }));
                }}
                className="text-xs rounded border bg-background px-2 py-0.5"
              >
                {SDLC_PHASES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.emoji} {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <Badge variant="outline" className="text-xs">
                {phaseEmoji(capability.sdlc_phase)}{" "}
                {phaseLabel(capability.sdlc_phase)}
              </Badge>
            )}
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setMetadata((prev) => ({ ...prev, isDirty: true }));
              }}
              className="text-xl font-semibold w-full bg-transparent border-b border-muted-foreground/30 outline-none focus:border-primary pb-1"
            />
          ) : (
            <h2 className="text-xl font-semibold">{capability.name}</h2>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isEditing ? (
            <select
              value={editStatus}
              onChange={(e) => {
                setEditStatus(e.target.value);
                setMetadata((prev) => ({ ...prev, isDirty: true }));
              }}
              className="text-xs rounded border bg-background px-2 py-1"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          ) : (
            <>
              <span
                className={`inline-block size-2.5 rounded-full ${health.color}`}
                title={health.label}
              />
              <span className="text-xs text-muted-foreground">{health.label}</span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground">
          Description
        </label>
        {isEditing ? (
          <div className="rounded-md border">
            <MilkdownFieldEditor
              content={editDescription}
              onChange={(value) => {
                setEditDescription(value);
                setMetadata((prev) => ({ ...prev, isDirty: true }));
              }}
              placeholder="Describe this capability..."
              minHeight="150px"
            />
          </div>
        ) : capability.description ? (
          <div className="text-sm p-3 rounded-md border bg-muted/30">
            <SpecViewer content={capability.description} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic p-3 rounded-md border bg-muted/20">
            No description
          </p>
        )}
      </div>

      {/* Health Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{features.length}</div>
          <div className="text-xs text-muted-foreground">Features</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{bugs.length}</div>
          <div className="text-xs text-muted-foreground">Bugs</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">
            {features.length > 0
              ? `${Math.round((features.filter((f) => f.status === "done").length / features.length) * 100)}%`
              : "—"}
          </div>
          <div className="text-xs text-muted-foreground">Completion</div>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Features ({features.length})
          </label>
          {isEditing && (
            <ItemAssignmentPicker
              capabilityId={capabilityId}
              itemType="feature"
              existingIds={existingFeatureIds}
              onAssigned={handleRefreshItems}
            />
          )}
        </div>
        {features.length === 0 ? (
          <p className="text-xs text-muted-foreground italic p-3 rounded-md border bg-muted/20">
            No features assigned to this capability
          </p>
        ) : (
          <div className="space-y-1">
            {features.map((f) => (
              <div
                key={f.id}
                className="flex w-full items-center gap-3 p-2.5 rounded-md border bg-muted/20 text-left hover:bg-accent transition-colors"
              >
                <button
                  type="button"
                  onClick={() => openFeature(f.id, f.title)}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <span
                    className={`inline-block size-2 shrink-0 rounded-full ${statusDotColors[f.status] ?? "bg-gray-400"}`}
                  />
                  <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{f.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[f.status] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {f.status.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityColors[f.priority] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {f.priority}
                  </span>
                </button>
                {isEditing && (
                  <UnassignButton
                    capabilityId={capabilityId}
                    itemType="feature"
                    itemId={f.id}
                    onUnassigned={handleRefreshItems}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bugs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Bugs ({bugs.length})
          </label>
          {isEditing && (
            <ItemAssignmentPicker
              capabilityId={capabilityId}
              itemType="bug"
              existingIds={existingBugIds}
              onAssigned={handleRefreshItems}
            />
          )}
        </div>
        {bugs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic p-3 rounded-md border bg-muted/20">
            No bugs assigned to this capability
          </p>
        ) : (
          <div className="space-y-1">
            {bugs.map((b) => (
              <div
                key={b.id}
                className="flex w-full items-center gap-3 p-2.5 rounded-md border bg-muted/20 text-left hover:bg-accent transition-colors"
              >
                <button
                  type="button"
                  onClick={() => openBug(b.id, b.title)}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <span
                    className={`inline-block size-2 shrink-0 rounded-full ${statusDotColors[b.status] ?? "bg-gray-400"}`}
                  />
                  <BugIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{b.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityColors[b.severity] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {b.severity}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[b.status] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {b.status.replace(/_/g, " ")}
                  </span>
                </button>
                {isEditing && (
                  <UnassignButton
                    capabilityId={capabilityId}
                    itemType="bug"
                    itemId={b.id}
                    onUnassigned={handleRefreshItems}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      {capability.valid_from && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Last modified: {new Date(capability.valid_from).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ARTIFACT DEFINITION
// =============================================================================

/**
 * Content router that listens for the refine-wizard open event
 * and routes between wizard, browser, and detail views.
 */
function CapabilityContentRouter({
  content,
  isLoading,
  metadata,
  setMetadata,
}: {
  content: string;
  isLoading: boolean;
  metadata: CapabilityArtifactMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<CapabilityArtifactMetadata>>;
}) {
  // Listen for toolbar's "open wizard" event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setMetadata((prev) => ({
          ...prev,
          refineWizard: {
            currentStep: 0,
            totalSteps: TOTAL_WIZARD_STEPS,
            answers: {},
            steps: {},
            isLoadingStep: false,
            capabilityName: detail.capabilityName,
            capabilityId: detail.capabilityId,
            sdlcPhase: detail.sdlcPhase,
            currentDescription: detail.currentDescription,
          },
        }));
      }
    };
    window.addEventListener("capability-refine-open", handler);
    return () => window.removeEventListener("capability-refine-open", handler);
  }, [setMetadata]);

  // Refine wizard overlay
  if (metadata?.refineWizard) {
    return (
      <RefineDescriptionWizard
        state={metadata.refineWizard}
        setMetadata={setMetadata}
        sendMessage={(msg) => {
          window.dispatchEvent(
            new CustomEvent("capability-refine-send", { detail: msg }),
          );
        }}
      />
    );
  }

  // Browser mode
  if (!metadata?.capabilityId) {
    if (isLoading) return <DocumentSkeleton artifactKind="text" />;
    return <CapabilitiesBrowserView setMetadata={setMetadata} />;
  }

  // Detail mode
  return (
    <CapabilityDetailView
      capabilityId={metadata.capabilityId}
      isEditing={metadata.isEditing ?? false}
      setMetadata={setMetadata}
    />
  );
}

export const capabilityArtifact = new Artifact<"capability", CapabilityArtifactMetadata>(
  {
    kind: "capability",
    description:
      "Capability management — browse SDLC capability areas, view grouped features and bugs, and track capability health.",

    initialize: async ({ documentId, setMetadata, setArtifact }) => {
      // Browser mode
      if (documentId === "capabilities-browser") {
        setMetadata({ capabilityId: null, isEditing: false, isDirty: false, isSaving: false, refineWizard: null });
        return;
      }

      // Detail mode — fetch capability data
      setMetadata({ capabilityId: documentId, isEditing: false, isDirty: false, isSaving: false, refineWizard: null });

      try {
        const res = await fetch(`/api/capabilities?id=${documentId}`);
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
        console.error("[Capability] detail fetch error:", e);
      }
    },

    onStreamPart: ({ streamPart, setArtifact }) => {
      if (streamPart.type === "data-capabilityDelta") {
        setArtifact((draftArtifact) => ({
          ...draftArtifact,
          content: streamPart.data as string,
          isVisible: true,
          status: "streaming",
        }));
      }
    },

    content: ({ content, isLoading, metadata, setMetadata }) => {
      return (
        <CapabilityContentRouter
          content={content}
          isLoading={isLoading}
          metadata={metadata}
          setMetadata={setMetadata}
        />
      );
    },

    actions: [
      {
        icon: <EyeIcon size={18} />,
        description: "Toggle view / edit mode",
        onClick: ({ metadata, setMetadata }) => {
          const isEditing = metadata?.isEditing ?? false;
          if (!metadata?.capabilityId) return; // No toggle in browser mode
          setMetadata({
            ...metadata,
            isEditing: !isEditing,
          });
        },
      },
      {
        icon: <SaveIcon size={18} />,
        description: "Save capability",
        onClick: async ({ metadata }) => {
          // Save is handled inside the component via handleSave,
          // but this triggers a DOM event that the component can listen to.
          // Instead, we'll use a custom event pattern.
          if (!metadata?.capabilityId || !metadata?.isEditing) return;
          // Trigger save via custom event
          window.dispatchEvent(new CustomEvent("capability-save"));
        },
        isDisabled: ({ metadata }) => {
          return !metadata?.isEditing || !metadata?.isDirty || metadata?.isSaving || false;
        },
      },
      {
        icon: <CopyIcon size={18} />,
        description: "Copy capability data to clipboard",
        onClick: ({ content }) => {
          navigator.clipboard.writeText(content);
          toast.success("Copied to clipboard!");
        },
      },
      {
        icon: <MessageIcon size={18} />,
        description: "Copy capability summary to clipboard",
        onClick: ({ content }) => {
          try {
            const data = JSON.parse(content);
            const summary = `Capability: ${data.name}\nPhase: ${data.sdlc_phase}\nDescription: ${data.description ?? "N/A"}`;
            navigator.clipboard.writeText(summary);
            toast.success("Summary copied to clipboard!");
          } catch {
            navigator.clipboard.writeText(content);
            toast.success("Copied to clipboard!");
          }
        },
      },
    ],

    toolbar: [
      {
        icon: <PenIcon />,
        description: "Refine description",
        immediate: true,
        onClick: async ({ sendMessage, artifactId, artifactTitle }) => {
          try {
            // Fetch current capability data for context
            const capRes = await fetch(`/api/capabilities?id=${artifactId}`);
            const cap = capRes.ok ? await capRes.json() : null;

            // Set up a one-shot listener for the wizard completion event
            const handler = (e: Event) => {
              const detail = (e as CustomEvent).detail;
              if (detail) {
                sendMessage(detail);
              }
              window.removeEventListener("capability-refine-send", handler);
            };
            window.addEventListener("capability-refine-send", handler);

            // Open the wizard by dispatching a metadata-update event
            window.dispatchEvent(
              new CustomEvent("capability-refine-open", {
                detail: {
                  capabilityName: artifactTitle,
                  capabilityId: artifactId,
                  sdlcPhase: cap?.sdlc_phase ?? "unknown",
                  currentDescription: cap?.description ?? "",
                },
              }),
            );
          } catch {
            toast.error("Failed to load capability data");
          }
        },
      },
      {
        icon: <SparklesIconCustom />,
        description: "Analyze capability health",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Analyze the health of the capability "${artifactTitle}" (ID: ${artifactId}). Review its assigned features and bugs, assess completion progress, identify bottlenecks or risks, and provide a summary with actionable recommendations.`,
              },
            ],
          });
        },
      },
      {
        icon: <PenIcon />,
        description: "Generate description from items",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Generate a comprehensive description for the capability "${artifactTitle}" (ID: ${artifactId}) based on its assigned features and bugs. The description should explain the capability's purpose, scope, and current state in markdown format.`,
              },
            ],
          });
        },
      },
      {
        icon: <MessageIcon />,
        description: "Suggest features to assign",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Review all features in the system and suggest which unassigned features should belong to the capability "${artifactTitle}" (ID: ${artifactId}). Consider the capability's SDLC phase and purpose when making suggestions.`,
              },
            ],
          });
        },
      },
      {
        icon: <MessageIcon />,
        description: "Suggest bugs to assign",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Review all bugs in the system and suggest which unassigned bugs should belong to the capability "${artifactTitle}" (ID: ${artifactId}). Consider the capability's scope and the bugs' context when making suggestions.`,
              },
            ],
          });
        },
      },
      {
        icon: <SparklesIconCustom />,
        description: "Identify coverage gaps",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Analyze the capability "${artifactTitle}" (ID: ${artifactId}) for coverage gaps. Check if there are missing feature areas, untested scenarios, or important functionality not yet covered by features or specs. Suggest new features or tasks to close the gaps.`,
              },
            ],
          });
        },
      },
      {
        icon: <PenIcon />,
        description: "Generate release notes",
        immediate: true,
        onClick: ({ sendMessage, artifactId, artifactTitle }) => {
          sendMessage({
            role: "user",
            parts: [
              {
                type: "text",
                text: `Generate release notes for the capability "${artifactTitle}" (ID: ${artifactId}) based on its completed features and resolved bugs. Format as user-facing release notes with sections for new features, improvements, and bug fixes.`,
              },
            ],
          });
        },
      },
    ],
  },
);
