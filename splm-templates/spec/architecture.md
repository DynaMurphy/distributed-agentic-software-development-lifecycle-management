---
name: architecture
displayName: Architecture Decision Record Template
category: spec
version: 1.0.0
description: ADR template for documenting significant architectural decisions.
variables:
  - name: title
    label: Decision Title
    type: string
    required: true
  - name: decision_date
    label: Decision Date
    type: date
    required: false
  - name: status
    label: Decision Status
    type: enum
    values: [proposed, accepted, deprecated, superseded]
    default: proposed
---

# ADR: {{title}}

**Status**: {{status:proposed}}
**Date**: {{decision_date}}

## Context

_Describe the forces at play, including technological, political, social, and project constraints. These forces are likely in tension and should be called out as such._

## Decision

_Describe the decision that was made. Use active voice: "We will..."_

## Alternatives Considered

### Alternative 1: _Name_
- **Pros**: 
- **Cons**: 
- **Why rejected**: 

### Alternative 2: _Name_
- **Pros**: 
- **Cons**: 
- **Why rejected**: 

## Consequences

### Positive
- _Benefit 1_
- _Benefit 2_

### Negative
- _Tradeoff 1_
- _Tradeoff 2_

### Risks
- _Risk 1 and mitigation_
- _Risk 2 and mitigation_

## Architecture Diagram

```mermaid
flowchart TD
    A[Component] --> B[Component]
```

## Implementation Notes
_Key implementation details, migration steps, or rollout plan._

## References
- _Link to related ADRs, specs, or external resources_
