# Spec-Driven Development v2

AI-powered specification editor and **Software Product Lifecycle Manager (SPLM)** for crafting specifications, managing features, tracking bugs, and maintaining a prioritized product backlog. Built on the [Vercel Chat SDK](https://github.com/vercel/ai-chatbot) with a [Milkdown](https://milkdown.dev/) WYSIWYG markdown editor and an **Agentic Cascade** workflow powered by multiple AI providers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Chat Interface (AI SDK + useChat)                          │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │  Chat Panel   │  │  Artifact Panel                      │ │
│  │  - Messages   │  │  ┌────────────────────────────────┐  │ │
│  │  - AI input   │  │  │ Milkdown Markdown Editor        │  │ │
│  │  - Model      │  │  │ Feature Detail View            │  │ │
│  │    selector   │  │  │ Bug Report View                │  │ │
│  │  - SPLM tools │  │  │ Backlog List View              │  │ │
│  └──────────────┘  │  │ Code / Image / Sheet editors    │  │ │
│                     │  └────────────────────────────────┘  │ │
│                     └──────────────────────────────────────┘ │
├──────────────┬──────────────────────────────────────────────┤
│  Sidebar     │  Editor Layer:  Milkdown WYSIWYG Markdown    │
│  ✨ Features │                                               │
│  🐛 Bugs     ├──────────────────────────────────────────────┤
│  📋 Backlog  │  AI Providers:  Vercel AI Gateway             │
│  💬 Chats    │  Anthropic · Google · xAI                     │
├──────────────┼──────────────────────────────────────────────┤
│  Database:   │  PostgreSQL + periods extension               │
│  - Bitemporal features, bugs, tasks, backlog, doc links     │
│  - Bitemporal spec documents                                │
│  - Chat/message history (Drizzle ORM)                       │
├──────────────┴──────────────────────────────────────────────┤
│  MCP Server:  AI agent tooling                              │
│  - Specs: read · append · propose changes                   │
│  - SPLM: features · bugs · backlog · document linking       │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Specification Editing
- **AI Chat Interface** — Conversational AI that creates and edits specification documents
- **Milkdown WYSIWYG Editor** — Full markdown WYSIWYG editing with formatting toolbar, code blocks, tables, and diff view
- **Native Markdown** — AI generates markdown, edited natively in the Milkdown editor
- **Bitemporal Versioning** — Full document history with both valid-time and transaction-time tracking

### Software Product Lifecycle Management (SPLM)
- **Feature Management** — Create, triage, and track features through a cascade workflow (Draft → Triage → Backlog → Spec Generation → Implementation → Testing → Done)
- **Bug Management** — Report bugs with severity, steps-to-reproduce, expected/actual behavior; AI-assisted triage and duplicate detection
- **Task Management** — Break features and bugs into actionable tasks with effort estimates
- **Product Backlog** — Prioritized, ranked list of features and bugs ready for development
- **Document Linking** — Many-to-many relationships between work items and spec documents; features can have sub-features, all feeding into shared specifications
- **AI-Assisted Workflows** — Triage, prioritization, duplicate detection, impact analysis, and spec generation powered by AI

### Agentic Cascade Flow
```
Feature/Bug → Triage → Backlog → Spec Generation → Implementation → Testing → Done
     ↑           ↑         ↑            ↑
     AI Draft    AI Triage  AI Priority  AI Spec Gen
```

### Infrastructure
- **Multi-Provider AI** — Anthropic Claude, Google Gemini, xAI Grok (no OpenAI dependency)
- **MCP Server** — External AI agents can manage specs, features, bugs, backlog, and document links
- **Auth** — NextAuth v5 with login/registration

## How to Use the Application

### Starting a Chat

1. Open the app at `http://localhost:3000` and log in (or register a new account).
2. Type a message in the chat input. The AI assistant understands natural language requests for all SPLM operations.

### Managing Features

Ask the AI to manage features in natural language:

| What you want | Example prompt |
|---------------|----------------|
| Create a feature | *"Create a feature called User Authentication with OAuth2 support"* |
| List features | *"Show me all features in draft status"* |
| View a feature | *"Open the User Authentication feature"* — opens in the artifact panel |
| Update a feature | *"Change the priority of User Authentication to critical"* |
| Create sub-features | *"Create a sub-feature for Google OAuth under User Authentication"* |
| Triage a feature | *"Triage the User Authentication feature"* — AI evaluates priority and complexity |
| Detect duplicates | *"Check if User Authentication has any duplicates"* |
| Analyze impact | *"What's the impact of the User Authentication feature on existing specs?"* |

When a feature opens in the artifact panel, you can:
- **Edit fields** directly (title, description, status, priority)
- **Save** changes with the save button
- **View sub-features** and their status
- **See linked documents** at the bottom
- Use the **toolbar** for AI triage, spec generation, or improvement suggestions

### Managing Bugs

| What you want | Example prompt |
|---------------|----------------|
| Report a bug | *"Report a bug: Login page crashes on Safari when using SSO"* |
| List bugs | *"Show all critical bugs"* |
| View a bug | *"Open the Safari SSO bug"* |
| Triage a bug | *"Triage the Safari SSO bug"* |
| Update severity | *"Set the Safari SSO bug severity to blocker"* |

The bug artifact panel includes fields for:
- **Severity** (blocker / critical / major / minor / trivial)
- **Steps to reproduce**, expected behavior, actual behavior
- **Environment** details
- **AI Insights** — triage results, duplicate checks, impact analysis

### Working with the Backlog

| What you want | Example prompt |
|---------------|----------------|
| View backlog | *"Show me the product backlog"* — opens ranked list in artifact panel |
| Promote to backlog | *"Add the User Authentication feature to the backlog"* |
| Prioritize | *"Help me prioritize the backlog based on impact and urgency"* |
| Sprint planning | *"Help me plan the next sprint from the backlog"* |

### Specification Documents

| What you want | Example prompt |
|---------------|----------------|
| Create a spec | *"Create a specification document for the authentication module"* |
| Generate from feature | *"Generate a spec from the User Authentication feature and its sub-features"* — auto-links the spec |
| Open a spec | Use the 📄 document picker button, or *"Open spec document Authentication Module"* |
| Edit a spec | Use the Milkdown editor directly, or ask AI to update sections |
| Link to work items | *"Link this spec to the User Authentication feature"* |

Spec documents show **linked work items** (features/bugs) at the top of the editor.

### Document Linking

All spec documents can be linked to features and bugs (many-to-many):

| What you want | Example prompt |
|---------------|----------------|
| Link a document | *"Link the Authentication spec to the OAuth feature"* |
| Suggest links | *"Suggest which documents should be linked to the User Authentication feature"* |
| View links | Open any feature/bug to see linked docs, or open a spec to see linked items |

### Sidebar Navigation

The sidebar (left panel) has collapsible sections:
- **✨ Features** — Click to expand; shows all features with status indicators
- **🐛 Bugs** — Click to expand; shows bugs with severity highlights
- **📋 Backlog** — Click to expand; shows ranked backlog items
- **💬 Chat History** — Previous conversations

### AI Toolbar Actions

When viewing an artifact, the toolbar at the bottom provides quick AI actions:

| Artifact | Toolbar Actions |
|----------|----------------|
| **Feature** | AI Triage · Generate Spec · Suggest Improvements |
| **Bug** | AI Triage · Suggest Fix Approach |
| **Backlog** | AI Prioritize · Sprint Planning Help |
| **Spec** | Add Requirements · Review & Improve |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ (with `periods` extension for bitemporal features)

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your:
#   - AUTH_SECRET (generate with: openssl rand -base64 32)
#   - AI_GATEWAY_API_KEY (from https://vercel.com/ai-gateway)
#   - POSTGRES_URL (your PostgreSQL connection string)

# Run Drizzle database migrations (chat tables)
pnpm db:migrate

# Run bitemporal schema (spec documents)
psql -d spec_docs -f database/schema.sql

# Run SPLM schema (features, bugs, tasks, backlog, document links)
psql -d spec_docs -f database/splm-schema.sql

# Start dev server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | NextAuth secret key |
| `AI_GATEWAY_API_KEY` | Yes | Vercel AI Gateway API key |
| `POSTGRES_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis for resumable streams |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob for file uploads |

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login/register pages
│   └── (chat)/             # Chat interface + API routes
│       └── api/
│           ├── chat/       # AI chat endpoint (19 SPLM tools registered)
│           ├── features/   # Feature CRUD API
│           ├── bugs/       # Bug CRUD API
│           ├── tasks/      # Task CRUD API
│           ├── backlog/    # Backlog management API
│           ├── item-links/ # Document ↔ work item linking API
│           └── spec-document/ # Bitemporal spec document API
├── artifacts/              # Artifact type definitions
│   ├── feature/            # Feature artifact (structured form + AI insights)
│   │   ├── client.tsx      # Detail view with sub-features, linked docs
│   │   └── server.ts       # LLM-driven feature drafting
│   ├── bug/                # Bug artifact (severity, reproduce steps)
│   │   ├── client.tsx      # Bug report view with fields
│   │   └── server.ts       # LLM-driven bug analysis
│   ├── backlog/            # Backlog artifact (ranked list view)
│   │   ├── client.tsx      # Prioritized list with type icons
│   │   └── server.ts       # Backlog data fetching
│   ├── spec/               # Spec document artifact (Milkdown editor)
│   ├── text/               # Text artifact
│   ├── code/               # Code editor artifact
│   ├── image/              # Image artifact
│   └── sheet/              # Spreadsheet artifact
├── components/
│   ├── app-sidebar.tsx        # Sidebar with SPLM sections + chat history
│   ├── sidebar-splm.tsx       # ✨ Features / 🐛 Bugs / 📋 Backlog sections
│   ├── linked-items.tsx       # LinkedDocumentsBadge / LinkedItemsBadge
│   ├── milkdown-editor.tsx     # Milkdown WYSIWYG Markdown editor
│   ├── artifact.tsx           # Artifact panel layout (8 kinds registered)
│   ├── chat.tsx               # Main chat component
│   └── ...                    # UI components (shadcn/ui + Radix)
├── lib/
│   ├── editor/             # Editor utilities
│   ├── ai/                 # AI provider config + tools
│   │   ├── providers.ts    # Vercel AI Gateway setup
│   │   ├── models.ts       # Available model definitions
│   │   ├── prompts.ts      # System prompts (includes SPLM guidance)
│   │   └── tools/          # 26 AI tools
│   │       ├── feature-management.ts   # list, get, create, update features
│   │       ├── bug-management.ts       # list, get, create, update bugs
│   │       ├── task-management.ts      # list, create, update tasks
│   │       ├── backlog-management.ts   # view, promote, triage, duplicates, impact
│   │       ├── document-linking.ts     # link, suggest links
│   │       ├── generate-spec-from-feature.ts  # AI spec generation
│   │       ├── spec-document.ts        # list, open, update specs
│   │       └── ...                     # create/update document, weather, suggestions
│   ├── db/
│   │   ├── bitemporal-work-items.ts  # SPLM queries (features, bugs, tasks, backlog, links)
│   │   ├── bitemporal-queries.ts     # Spec document queries
│   │   ├── queries.ts               # Drizzle ORM chat queries
│   │   └── schema.ts                # Drizzle schema (chat tables)
│   └── artifacts/          # Server-side artifact handlers
├── database/
│   ├── schema.sql          # Bitemporal spec documents schema
│   └── splm-schema.sql     # SPLM tables (features, bugs, tasks, backlog, links)
└── mcp-server/             # MCP server for external AI agent access
    └── src/
        ├── index.ts        # 11 MCP tools (specs + SPLM)
        ├── db.ts           # Database connection
        └── db.ts           # Database connection
```

## How It Works

### Chat + Spec Editing Flow

1. **User sends a message** in the chat → AI decides to create/update a document
2. **AI streams markdown content** via `data-textDelta` stream parts
3. **Client accumulates markdown** in the artifact state
4. **Milkdown editor** receives markdown content directly:
   - During streaming: throttled updates (every ~500ms) via `replaceAll()` macro
   - On completion: final content load
5. **User edits** in Milkdown → markdown saved directly
6. **Version history** stored in PostgreSQL (bitemporal or Chat SDK compound key)

### SPLM Agentic Cascade Flow

1. **User creates a feature or bug** via chat → AI drafts it with structured fields → stored in bitemporal table
2. **AI triage** — Claude Haiku 4.5 evaluates priority, complexity, and recommends action → stored in `ai_metadata`
3. **Duplicate detection** — AI compares against existing items → flags potential duplicates
4. **Promote to backlog** — Item gets a rank in the prioritized backlog; status updates to "backlog"
5. **Spec generation** — AI gathers feature + sub-features + tasks → generates markdown spec → auto-links document
6. **Impact analysis** — AI evaluates how a change affects existing specs and backlog items
7. **All data is bitemporal** — every change creates a new version; full history is preserved with valid-time and transaction-time

### Data Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│   Features   │───→│  Backlog     │    │  Spec Documents  │
│  (bitemporal)│    │  Items       │    │  (bitemporal)    │
└──────┬───────┘    │  (bitemporal)│    └────────┬─────────┘
       │            └──────────────┘             │
       │  sub-features                           │
       ↓                                         │
┌──────────────┐    ┌──────────────┐    ┌────────┴─────────┐
│  Sub-Features│    │   Tasks      │    │  Item-Document   │
│  (bitemporal)│    │  (bitemporal)│    │  Links           │
└──────────────┘    └──────────────┘    │  (bitemporal)    │
                                        │  many-to-many    │
┌──────────────┐                        └──────────────────┘
│    Bugs      │──────────────────────────────↑
│  (bitemporal)│
└──────────────┘
```

## AI Model Configuration

Models are configured in `lib/ai/models.ts`. The default setup uses Vercel AI Gateway for provider-agnostic access:

| Provider | Models | Use Case |
|----------|--------|----------|
| Anthropic | Claude Haiku 4.5, Sonnet 4.5, Opus 4.5 | Chat + Artifacts + **SPLM Triage** |
| Google | Gemini 2.5 Flash Lite, Gemini 3 Pro | Default chat model |
| xAI | Grok 4.1 Fast | Fast responses |
| Reasoning | Claude 3.7 Sonnet, Grok Code Fast | Complex analysis |

> **SPLM Triage**: Claude Haiku 4.5 is used for fast, cost-effective triage operations (priority assessment, duplicate detection, impact analysis).

## MCP Server

The MCP server (`mcp-server/`) exposes 11 tools for external AI agents (e.g., Claude Desktop, Cursor, Cline):

| Tool | Description |
|------|-------------|
| `list_specs` | List all spec documents |
| `read_spec` | Read spec content as Markdown |
| `update_spec_section` | Revise a section of a spec |
| `list_features` | List features with optional status filter |
| `read_feature` | Get full feature details |
| `update_feature_status` | Change feature status |
| `list_bugs` | List bugs with optional severity/status filter |
| `read_bug` | Get full bug details |
| `update_bug_status` | Change bug status + resolution |
| `list_backlog` | View prioritized backlog |
| `link_document` | Link a spec to a feature/bug |
| `get_item_documents` | List documents linked to an item |

## Based On

- [Vercel Chat SDK](https://github.com/vercel/ai-chatbot) — Chat interface, artifact system, AI streaming
- [Milkdown](https://milkdown.dev/) — WYSIWYG markdown editor (ProseMirror-based)
- [spec-driven-development](https://github.com/) — Bitemporal versioning, MCP server, markdown editor
