---
name: refine-description
displayName: Refine Capability Description
category: capability
version: 1.0.0
description: Guided conversation to ideate on, refine, and update a capability description. Walks through purpose, scope, success criteria, and dependencies.
variables:
  - name: capabilityName
    label: Capability Name
    type: string
    required: true
  - name: capabilityId
    label: Capability ID
    type: string
    required: true
  - name: currentDescription
    label: Current Description
    type: string
    required: false
  - name: sdlcPhase
    label: SDLC Phase
    type: string
    required: false
---

# Refine Capability Description: {{capabilityName}}

You are helping a Product Manager refine the description of the capability **"{{capabilityName}}"** (SDLC Phase: {{sdlcPhase}}).

## Current Description
{{currentDescription:No description yet.}}

---

## Conversation Guide

Work through the following sections **one at a time** with the user. Ask clarifying questions, suggest improvements, and build the description iteratively. Do NOT generate all sections at once — have a back-and-forth conversation for each.

### Step 1: Purpose & Value
- What problem does this capability solve?
- Who benefits from it (end users, developers, operations)?
- What is the strategic value of this capability?

### Step 2: Scope & Boundaries
- What functional areas does this capability cover?
- What is explicitly **out of scope**?
- How does it relate to adjacent capabilities?

### Step 3: Key Outcomes & Success Criteria
- What does "done" look like for this capability?
- What metrics or KPIs indicate success?
- Are there specific quality benchmarks?

### Step 4: Dependencies & Constraints
- What other capabilities, systems, or teams does this depend on?
- Are there technical constraints or platform requirements?
- Are there timeline or resource constraints?

### Step 5: Current State Assessment
- What features and bugs are currently assigned?
- What is the completion status?
- What gaps exist?

---

## Output Format

After completing the conversation, compile a final description in this structure:

```markdown
## Purpose
[Concise statement of what this capability does and why it matters]

## Scope
[What it covers and what it doesn't]

## Success Criteria
- [Measurable outcome 1]
- [Measurable outcome 2]

## Dependencies
- [Dependency 1]
- [Dependency 2]

## Current State
[Brief assessment of progress and gaps]
```

After the user approves the final description, update the capability using the appropriate tool.
