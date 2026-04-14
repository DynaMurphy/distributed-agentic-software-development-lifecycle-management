---
name: ui-component
displayName: UI Component Feature Template
category: feature
version: 1.0.0
description: Template for UI component features with accessibility and responsiveness requirements.
variables:
  - name: title
    label: Component Name
    type: string
    required: true
  - name: description
    label: Description
    type: string
    required: false
---

# {{title}}

## Summary
{{description:Describe the UI component and its user-facing purpose.}}

## User Story
As a **user**, I want to **[interact with this component]** so that **[benefit]**.

## Design Requirements
- **Responsive**: Works on mobile (320px) through desktop (1440px+)
- **Accessible**: WCAG 2.1 AA compliant
- **Theme**: Supports light and dark mode

## Component API
```tsx
interface {{title}}Props {
  // Define props here
}
```

## States
- [ ] **Default** — Initial render state
- [ ] **Loading** — Data fetching in progress
- [ ] **Empty** — No data to display
- [ ] **Error** — Error state with retry action
- [ ] **Disabled** — Non-interactive state

## Accessibility Requirements
- [ ] Keyboard navigable (Tab, Enter, Escape)
- [ ] Screen reader compatible (ARIA labels)
- [ ] Focus indicators visible
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] No motion without `prefers-reduced-motion` check

## Acceptance Criteria
- [ ] Renders correctly in all states
- [ ] Responsive across breakpoints
- [ ] Passes accessibility audit (axe)
- [ ] Matches design specifications
- [ ] No layout shift (CLS < 0.1)

## Technical Notes
_Component library, state management, animation approach._
