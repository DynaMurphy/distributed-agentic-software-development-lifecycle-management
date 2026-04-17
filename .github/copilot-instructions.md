# SPLM (Software Product Lifecycle Management) — Agent Workflow

This project uses the **Agentic SPLM** framework to manage features, bugs, tasks, specifications, capabilities, milestones, and repositories through MCP tools. The MCP server (`splm`) provides 43 tools for the full product lifecycle.

## Workflow Overview

```
1. Add Features & Bugs  →  create_feature / create_bug
2. Triage               →  triage_item (AI-assisted)
3. Promote to Backlog   →  promote_to_backlog
4. Write Specification  →  generate_spec / propose_spec_change / batch_edit_spec
5. Implement            →  update_feature(status: "implementation") → make code changes
6. Update Documentation →  propose_spec_change / append_spec_note
7. Mark Done            →  update_feature(status: "done") / update_bug(status: "done")
8. Assign Capabilities  →  assign_capability (link features/bugs to capability areas)
9. Plan Releases        →  create_milestone / add_milestone_item
```

## When to Use SPLM Tools

### Starting Work
1. **Always start with `workflow_status`** to see the current state of features, bugs, tasks, and backlog.
2. **Check `list_backlog`** to see prioritized items ready for implementation.
3. Pick the highest-ranked backlog item and **use `read_feature` or `read_bug`** to understand it fully.

### Implementing a Backlog Item
1. Update the item's status to `implementation`: `update_feature(id, status: "implementation")`.
2. If the item has tasks, list them with `list_tasks(parent_id)` and update each as you work.
3. Make the actual code changes using your native file editing tools.
4. Update task statuses as you complete them: `update_task(id, status: "done")`.
5. After all code changes, update the item status to `testing` or `done`.
6. If the spec needs updating, use `propose_spec_change` or `batch_edit_spec`.

### Status Lifecycle
Features and bugs follow this status cascade:
- `draft` → `triage` → `backlog` → `spec_generation` → `implementation` → `testing` → `done`
- Items can also be `rejected` at any point.

Tasks follow: `todo` → `in_progress` → `done` (or `blocked`).

## Tool Reference (43 tools)

### Repositories (4)
| Tool | Purpose |
|------|---------|
| `list_repositories` | List registered repositories (filter by status) |
| `read_repository` | Full repository details by ID |
| `create_repository` | Register a new GitHub repository for SPLM tracking |
| `update_repository` | Update repository fields (name, URL, status, etc.) |

### Spec Documents (5)
| Tool | Purpose |
|------|---------|
| `list_specs` | List all specification documents |
| `read_spec` | Read a spec as markdown (by id, or latest) |
| `append_spec_note` | Add a note to a spec |
| `propose_spec_change` | Track-changes edit (find & replace) |
| `batch_edit_spec` | Multiple tracked changes at once |

### Features (4)
| Tool | Purpose |
|------|---------|
| `list_features` | List features (filter by status/priority/type) |
| `read_feature` | Full feature details + sub-features + tasks + linked docs |
| `create_feature` | Create a new feature or sub-feature |
| `update_feature` | Update any fields (title, description, status, priority, etc.) |

### Bugs (4)
| Tool | Purpose |
|------|---------|
| `list_bugs` | List bugs (filter by status/severity/priority) |
| `read_bug` | Full bug details + tasks + linked docs |
| `create_bug` | Create a new bug report |
| `update_bug` | Update any fields |

### Tasks (4)
| Tool | Purpose |
|------|---------|
| `list_tasks` | List tasks (filter by parent/status) |
| `read_task` | Full task details |
| `create_task` | Create task under a feature or bug |
| `update_task` | Update task fields (status, priority, etc.) |

### Backlog (3)
| Tool | Purpose |
|------|---------|
| `list_backlog` | View prioritized backlog by rank |
| `promote_to_backlog` | Move a feature/bug to the backlog |
| `update_backlog_item` | Change rank, sprint label, or notes |

### Document Links (3)
| Tool | Purpose |
|------|---------|
| `link_document` | Link a spec to a feature/bug/task |
| `unlink_document` | Remove a document link |
| `get_item_documents` | List documents linked to an item |

### AI-Powered (5)
| Tool | Purpose |
|------|---------|
| `triage_item` | AI assesses priority, effort, risk |
| `detect_duplicates` | AI finds similar/duplicate items |
| `analyze_impact` | AI evaluates impact on specs and backlog |
| `suggest_document_links` | AI suggests relevant document links |
| `generate_spec` | AI generates a full spec from a feature |

### Workflow (1)
| Tool | Purpose |
|------|---------|
| `workflow_status` | Dashboard: item counts by status |

### Capabilities (7)
| Tool | Purpose |
|------|---------|
| `list_capabilities` | List capability areas (filter by status/SDLC phase) |
| `read_capability` | Full capability details + linked features, bugs, tasks |
| `create_capability` | Create a new functional capability area |
| `update_capability` | Update capability fields (name, description, phase, etc.) |
| `assign_capability` | Assign a feature/bug/task to a capability area |
| `unassign_capability` | Remove a feature/bug/task from a capability area |
| `get_item_capabilities` | Get all capabilities assigned to a feature/bug/task |

### Milestones (7)
| Tool | Purpose |
|------|---------|
| `list_milestones` | List release milestones (filter by status/type/repository) |
| `read_milestone` | Full milestone details + assigned items |
| `create_milestone` | Create a new milestone or release entry |
| `update_milestone` | Update milestone fields (title, dates, status, capacity, etc.) |
| `delete_milestone` | Delete a milestone and its item assignments |
| `add_milestone_item` | Assign a feature/bug/capability to a milestone |
| `remove_milestone_item` | Remove a feature/bug/capability from a milestone |
