"use client";

import { SparklesIcon } from "@/components/icons";

interface AIInsightsPanelProps {
  aiMetadata: Record<string, any>;
}

/**
 * Shared AI Insights panel displaying structured sections per AI action type.
 * Used in both feature and bug artifact detail views.
 */
export function AIInsightsPanel({ aiMetadata }: AIInsightsPanelProps) {
  if (!aiMetadata || Object.keys(aiMetadata).length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <SparklesIcon size={14} /> AI Insights
      </label>
      <div className="p-3 rounded-md border bg-muted/10 text-sm space-y-3">
        {/* 🎯 Triage */}
        {aiMetadata.triage && <TriageSection data={aiMetadata.triage} />}

        {/* 🔍 Duplicates */}
        {aiMetadata.duplicateCheck && (
          <DuplicatesSection data={aiMetadata.duplicateCheck} />
        )}

        {/* 📎 Suggested Links */}
        {aiMetadata.suggestedLinks && (
          <SuggestedLinksSection data={aiMetadata.suggestedLinks} />
        )}

        {/* 📝 Spec Generation */}
        {aiMetadata.specGeneration && (
          <SpecGenerationSection data={aiMetadata.specGeneration} />
        )}

        {/* 💥 Impact Analysis */}
        {aiMetadata.impactAnalysis && (
          <ImpactSection data={aiMetadata.impactAnalysis} />
        )}

        {/* 🔧 Implementation Plan */}
        {aiMetadata.implementationPlan && (
          <ImplementationPlanSection data={aiMetadata.implementationPlan} />
        )}

        {/* 🧪 Test Plan */}
        {aiMetadata.testPlan && (
          <TestPlanSection data={aiMetadata.testPlan} />
        )}

        {/* ✅ Signoff */}
        {aiMetadata.signoff && <SignoffSection data={aiMetadata.signoff} />}

        {/* 📐 Design Phase summary */}
        {aiMetadata.designPhase && (
          <DesignPhaseSection data={aiMetadata.designPhase} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Section Components
// =============================================================================

function SectionTimestamp({ date }: { date?: string }) {
  if (!date) return null;
  return (
    <span className="text-xs text-muted-foreground">
      ({new Date(date).toLocaleDateString()})
    </span>
  );
}

function TriageSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        🎯 Triage
        <SectionTimestamp date={data.triagedAt} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {data.suggestedPriority && (
          <div>
            Priority:{" "}
            <span className="font-medium capitalize">
              {data.suggestedPriority}
            </span>
          </div>
        )}
        {data.suggestedEffort && (
          <div>
            Effort: <span className="font-medium">{data.suggestedEffort}</span>
          </div>
        )}
        {data.riskLevel && (
          <div>
            Risk:{" "}
            <span className="font-medium capitalize">{data.riskLevel}</span>
          </div>
        )}
        {data.suggestedSprint && (
          <div>
            Sprint:{" "}
            <span className="font-medium">{data.suggestedSprint}</span>
          </div>
        )}
      </div>
      {data.rationale && (
        <p className="text-xs text-muted-foreground mt-1">{data.rationale}</p>
      )}
    </div>
  );
}

function DuplicatesSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        🔍 Duplicates
        <SectionTimestamp date={data.checkedAt} />
      </div>
      {Array.isArray(data.candidates) && data.candidates.length > 0 ? (
        <div className="space-y-1">
          {data.candidates.map((d: any) => (
            <div
              key={d.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="truncate">{d.title}</span>
              <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
                {d.similarityScore}% match
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No duplicates found</p>
      )}
    </div>
  );
}

function SuggestedLinksSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        📎 Suggested Links
        <SectionTimestamp date={data.suggestedAt} />
      </div>
      {Array.isArray(data.suggestions) && data.suggestions.length > 0 ? (
        <div className="space-y-1">
          {data.suggestions.map((s: any) => (
            <div
              key={s.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="truncate">{s.title}</span>
              <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                {s.relevanceScore}% · {s.suggestedLinkType}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No links suggested</p>
      )}
    </div>
  );
}

function SpecGenerationSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        📝 Specification
        <SectionTimestamp date={data.generatedAt} />
      </div>
      <p className="text-xs">
        {data.specTitle ?? "Specification generated"}
      </p>
    </div>
  );
}

function ImpactSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        💥 Impact
        <SectionTimestamp date={data.analyzedAt} />
        {data.overallRisk && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              data.overallRisk === "high"
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                : data.overallRisk === "medium"
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                  : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
            }`}
          >
            {data.overallRisk} risk
          </span>
        )}
      </div>
      {data.summary && (
        <p className="text-xs text-muted-foreground">{data.summary}</p>
      )}
      {Array.isArray(data.recommendations) &&
        data.recommendations.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc list-inside">
            {data.recommendations.map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
    </div>
  );
}

function ImplementationPlanSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        🔧 Implementation Plan
        <SectionTimestamp date={data.analyzedAt} />
      </div>
      {data.approach && (
        <p className="text-xs text-muted-foreground">{data.approach}</p>
      )}
      {Array.isArray(data.tasks) && data.tasks.length > 0 && (
        <div className="space-y-1">
          {data.tasks.map((t: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="truncate">{t.title}</span>
              <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                {t.estimatedEffort}
              </span>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(data.createdTaskIds) && data.createdTaskIds.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {data.createdTaskIds.length} task(s) created in the system
        </p>
      )}
    </div>
  );
}

function TestPlanSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        🧪 Test Plan
        <SectionTimestamp date={data.generatedAt} />
      </div>
      {Array.isArray(data.scenarios) && data.scenarios.length > 0 && (
        <div className="space-y-1.5">
          {data.scenarios.map((s: any, i: number) => (
            <div key={i} className="text-xs">
              <div className="flex items-center gap-1">
                <span className="font-medium">{s.name}</span>
                <span className="px-1 py-0.5 rounded bg-muted text-[10px]">
                  {s.type}
                </span>
              </div>
              <p className="text-muted-foreground text-[10px]">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(data.acceptanceCriteria) &&
        data.acceptanceCriteria.length > 0 && (
          <div className="mt-1">
            <div className="text-xs font-medium">Acceptance Criteria</div>
            <ul className="text-xs text-muted-foreground list-disc list-inside">
              {data.acceptanceCriteria.map((c: string, i: number) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      {Array.isArray(data.edgeCases) && data.edgeCases.length > 0 && (
        <div className="mt-1">
          <div className="text-xs font-medium">Edge Cases</div>
          <ul className="text-xs text-muted-foreground list-disc list-inside">
            {data.edgeCases.map((e: string, i: number) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SignoffSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        ✅ Signoff
        <SectionTimestamp date={data.signedOffAt} />
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            data.verdict === "approved"
              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
          }`}
        >
          {data.verdict}
        </span>
      </div>
      {data.summary && (
        <p className="text-xs text-muted-foreground">{data.summary}</p>
      )}
      {Array.isArray(data.completedItems) &&
        data.completedItems.length > 0 && (
          <div className="mt-1">
            <div className="text-xs font-medium text-green-600 dark:text-green-400">
              Completed
            </div>
            <ul className="text-xs text-muted-foreground list-disc list-inside">
              {data.completedItems.map((c: string, i: number) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      {Array.isArray(data.remainingRisks) &&
        data.remainingRisks.length > 0 && (
          <div className="mt-1">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Remaining Risks
            </div>
            <ul className="text-xs text-muted-foreground list-disc list-inside">
              {data.remainingRisks.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}

function DesignPhaseSection({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-1.5">
        📐 Design Phase
        <SectionTimestamp date={data.completedAt} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        <div>
          Duplicates:{" "}
          <span className="font-medium">{data.duplicatesFound ?? 0}</span>
        </div>
        <div>
          Links accepted:{" "}
          <span className="font-medium">{data.linksAccepted ?? 0}</span>
        </div>
        <div>
          Spec generated:{" "}
          <span className="font-medium">{data.specGenerated ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
