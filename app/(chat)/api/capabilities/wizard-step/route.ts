import { auth } from "@/app/(auth)/auth";
import { generateObject } from "ai";
import { z } from "zod";
import { getArtifactModel } from "@/lib/ai/providers";

const wizardStepSchema = z.object({
  id: z.string().describe("A short kebab-case identifier for this step"),
  title: z.string().describe("A concise title for the step (2-4 words)"),
  question: z
    .string()
    .describe("The main question to ask the user, tailored to their capability"),
  multiSelect: z
    .boolean()
    .describe("Whether the user can select multiple options"),
  options: z
    .array(
      z.object({
        label: z.string().describe("Short display label for the option"),
        value: z
          .string()
          .describe("Descriptive value capturing the meaning of this choice"),
      }),
    )
    .describe("Proposed answer options tailored to this specific capability (provide 4 to 8 options)"),
});

// The 5 step topics are fixed to ensure consistent structure, but everything
// else (question wording, options) is dynamically generated.
const STEP_TOPICS = [
  {
    topic: "purpose",
    guidance:
      "Ask about the primary purpose and value proposition of this capability. What problem does it solve? Why does it matter?",
  },
  {
    topic: "audience",
    guidance:
      "Ask about the target audience and beneficiaries. Who uses this capability? Who is impacted by it?",
  },
  {
    topic: "scope",
    guidance:
      "Ask about the scope and boundaries. What does this capability include and exclude? How broad or narrow is it?",
  },
  {
    topic: "success",
    guidance:
      "Ask about success criteria and outcomes. How will we know this capability is complete and working well?",
  },
  {
    topic: "constraints",
    guidance:
      "Ask about dependencies, constraints, and risks. What could block progress? What does this depend on?",
  },
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const {
    stepIndex,
    capabilityName,
    capabilityDescription,
    sdlcPhase,
    previousAnswers,
  } = body as {
    stepIndex: number;
    capabilityName: string;
    capabilityDescription: string;
    sdlcPhase: string;
    previousAnswers: Record<
      string,
      { selected: string[]; freeText: string }
    >;
  };

  if (stepIndex < 0 || stepIndex >= STEP_TOPICS.length) {
    return Response.json({ error: "Invalid step index" }, { status: 400 });
  }

  const stepTopic = STEP_TOPICS[stepIndex];

  // Build context from previous answers
  const previousContext =
    Object.keys(previousAnswers).length > 0
      ? Object.entries(previousAnswers)
          .map(([id, answer]) => {
            const parts: string[] = [];
            if (answer.selected.length > 0)
              parts.push(`Selected: ${answer.selected.join(", ")}`);
            if (answer.freeText.trim())
              parts.push(`Additional: ${answer.freeText.trim()}`);
            return `- ${id}: ${parts.join("; ")}`;
          })
          .join("\n")
      : "No previous answers yet.";

  const { object: step } = await generateObject({
    model: getArtifactModel(),
    schema: wizardStepSchema,
    prompt: `You are helping a product manager refine the description of a software capability.

Capability name: "${capabilityName}"
SDLC phase: ${sdlcPhase}
Current description: ${capabilityDescription || "No description yet."}

Previous questionnaire answers:
${previousContext}

Current step topic: ${stepTopic.topic}
Guidance: ${stepTopic.guidance}

Generate a questionnaire step for this specific capability. The question and options should be:
- Specifically tailored to "${capabilityName}" — reference it by name and use domain-relevant language
- Informed by the current description and SDLC phase
- Built upon the user's previous answers (if any) — acknowledge what they've already shared and dig deeper
- Practical and actionable — each option should describe a concrete aspect relevant to this capability
- The options should cover the most likely answers for THIS specific capability, not generic options

Use the step id "${stepTopic.topic}" for the id field.`,
  });

  return Response.json({
    step,
    totalSteps: STEP_TOPICS.length,
  });
}
