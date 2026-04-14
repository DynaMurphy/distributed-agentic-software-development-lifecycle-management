---
name: default
displayName: Default Feature Template
category: feature
version: 1.0.0
description: Standard feature request template for most features.
variables:
  - name: title
    label: Feature Title
    type: string
    required: true
  - name: description
    label: Description
    type: string
    required: false
  - name: priority
    label: Priority
    type: enum
    values: [critical, high, medium, low]
    default: medium
  - name: author
    label: Author
    type: string
    required: false
---

# {{title}}

## Summary
{{description:Provide a brief summary of the feature and its value proposition.}}

## User Story
As a **[user role]**, I want to **[action]** so that **[benefit]**.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Notes
_Describe any technical considerations, constraints, or dependencies._

## Priority: {{priority:medium}}

## Tags
_Add relevant tags for categorization._
