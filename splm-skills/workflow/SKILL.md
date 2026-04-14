---
name: workflow
displayName: Workflow Manager
version: 1.0.0
description: 
---


# Workflow Skill

This skill defines the rules governing the SPLM product lifecycle workflow.
All agents MUST follow these status transition rules and gate conditions.

## Status Lifecycle

### Features & Bugs
```
draft → triage → backlog → spec_generation → implementation → testing → done
                                                                        ↗
Any status ──────────────────────────────────────────────────→ rejected
```

### Tasks
```
todo → in_progress → done
         ↓
       blocked
```

## Transition Rules

### draft → triage
- **Trigger**: Item is ready for assessment
- **Gate**: Title and description are non-empty
- **Action**: Run `triage_item` for AI assessment

### triage → backlog
- **Trigger**: Item has been assessed and approved
- **Gate**: Priority and effort estimate are set
- **Action**: Run `promote_to_backlog` (sets status automatically)
- **Optional**: Run `detect_duplicates` before promoting

### backlog → spec_generation
- **Trigger**: Item is selected for specification
- **Gate**: Item is in the backlog with a rank
- **Action**: Run `generate_spec` or manually write spec
- **Required**: Link spec document to item via `link_document`

### spec_generation → implementation
- **Trigger**: Specification is complete and reviewed
- **Gate**: At least one spec document is linked
- **Action**: Update status via `update_feature(status: "implementation")`
- **Optional**: Create implementation tasks via `create_task`

### implementation → testing
- **Trigger**: Code changes are complete
- **Gate**: All implementation tasks are `done`
- **Action**: Update status via `update_feature(status: "testing")`
- **Required**: Code changes committed with proper commit messages

### testing → done
- **Trigger**: All tests pass and quality gates are met
- **Gate**: Build passes, lint clean, tests green
- **Action**: Update status via `update_feature(status: "done")`
- **Required**: No open Critical review comments

### Any → rejected
- **Trigger**: Item is declined or superseded
- **Gate**: Provide rejection reason in description
- **Action**: Update status via `update_feature(status: "rejected")`

## Task Workflow

### todo → in_progress
- **Trigger**: Developer begins work
- **Action**: `update_task(id, status: "in_progress")`

### in_progress → done
- **Trigger**: Task is complete
- **Gate**: Code changes committed
- **Action**: `update_task(id, status: "done")`

### in_progress → blocked
- **Trigger**: Task cannot proceed
- **Gate**: Document blocker reason in description
- **Action**: `update_task(id, status: "blocked")`

## Backlog Prioritization Rules

1. **Rank 1-5**: Current sprint — actively being worked on
2. **Rank 6-15**: Next sprint — ready for implementation
3. **Rank 16+**: Future — needs more definition

### Re-prioritization Triggers
- New critical bug discovered
- Dependency chain changes
- Business priority shift
- Sprint capacity adjustment

## Automation Rules

### On Feature Creation
1. Status defaults to `draft`
2. Suggest running `triage_item`
3. Suggest running `detect_duplicates`

### On Bug Creation
1. Status defaults to `draft`
2. If severity is `blocker` or `critical`, auto-suggest triage
3. Suggest linking to affected feature

### On Spec Generation
1. Auto-link generated spec to source item
2. Update item status to `spec_generation`
3. Suggest creating implementation tasks

### On All Tasks Done
1. Suggest updating parent feature/bug to `testing`
2. Suggest running review

## Tools Reference
- `workflow_status`: Dashboard overview of all items by status
- `update_feature`, `update_bug`: Transition item status
- `update_task`: Transition task status
- `list_backlog`: View prioritized backlog
- `promote_to_backlog`: Move item to backlog

Follow the lifecycle strictly. Never skip gates without explicit approval.
