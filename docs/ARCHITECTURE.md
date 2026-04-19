# SPLM Platform — Architecture & Deployment Guide

> **Spec-Driven Development Platform** — A comprehensive AI-powered product lifecycle management system built on Next.js 16, with multi-provider LLM integration, bitemporal data versioning, and a 43-tool MCP agent.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Request Lifecycle](#3-request-lifecycle)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [AI Provider Architecture](#5-ai-provider-architecture)
6. [Copilot SDK Integration](#6-copilot-sdk-integration)
7. [Streaming & Real-Time Data Flow](#7-streaming--real-time-data-flow)
8. [Database Architecture](#8-database-architecture)
9. [MCP Server (Agent Layer)](#9-mcp-server-agent-layer)
10. [Artifact System](#10-artifact-system)
11. [API Routes](#11-api-routes)
12. [Deployment Options](#12-deployment-options)
13. [Remote Codebase Access from UI](#13-remote-codebase-access-from-ui)
14. [Environment Variables](#14-environment-variables)

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph Client ["Browser (Any Device)"]
        UI["React 19 UI<br/>Tailwind + Radix"]
        DSH["DataStreamHandler<br/>SSE Consumer"]
        SWR["SWR Cache<br/>Data Fetching"]
    end

    subgraph NextJS ["Next.js 16 (App Router)"]
        MW["Middleware<br/>proxy.ts"]
        AUTH["NextAuth v5<br/>JWT Sessions"]
        API["API Routes<br/>/api/*"]
        AI["AI Engine<br/>Vercel AI SDK"]
        TOOLS["22 AI Tools<br/>Chat-Integrated"]
    end

    subgraph Data ["Data Layer"]
        PG["PostgreSQL<br/>Bitemporal Tables"]
        REDIS["Redis<br/>Resumable Streams"]
        BLOB["Vercel Blob<br/>File Storage"]
    end

    subgraph AI_Providers ["LLM Providers"]
        ANTH["Anthropic<br/>Claude 4.5"]
        GOOG["Google<br/>Gemini 2.5"]
        OAI["OpenAI<br/>GPT-4.1"]
        XAI["xAI<br/>Grok"]
    end

    subgraph MCP ["MCP Server (Subprocess)"]
        MCPS["43 Tools<br/>StdIO Transport"]
    end

    UI -->|"POST /api/chat"| MW
    MW -->|"JWT Check"| AUTH
    AUTH -->|"Authorized"| API
    API --> AI
    AI --> TOOLS
    AI -->|"streamText()"| ANTH & GOOG & OAI & XAI
    TOOLS -->|"Drizzle ORM"| PG
    API -->|"SSE Stream"| DSH
    DSH --> UI
    SWR -->|"GET /api/*"| API
    API -->|"Stream IDs"| REDIS
    API -->|"File Uploads"| BLOB
    MCPS -->|"Direct pg"| PG
```

---

## 2. Technology Stack

```mermaid
graph LR
    subgraph Frontend
        A1["React 19"]
        A2["Next.js 16"]
        A3["Tailwind CSS 4"]
        A4["Radix UI"]
        A5["Milkdown Editor"]
        A6["CodeMirror 6"]
        A7["Mermaid Diagrams"]
        A8["Framer Motion"]
    end

    subgraph Backend
        B1["Next.js API Routes"]
        B2["NextAuth v5 Beta"]
        B3["Drizzle ORM"]
        B4["Vercel AI SDK v6"]
        B5["Zod Validation"]
    end

    subgraph Infrastructure
        C1["PostgreSQL + Periods"]
        C2["Redis / Vercel KV"]
        C3["Vercel Blob"]
        C4["Vercel Functions"]
        C5["OpenTelemetry"]
    end

    subgraph AI
        D1["Anthropic SDK"]
        D2["Google AI SDK"]
        D3["OpenAI SDK"]
        D4["xAI SDK"]
        D5["MCP Protocol"]
    end
```

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Next.js 16 (App Router, Turbopack), Tailwind CSS 4, Radix UI, Milkdown 7.20, CodeMirror 6, Mermaid 11.14, Framer Motion |
| **Backend** | Next.js API Routes, NextAuth v5, Drizzle ORM 0.34, Vercel AI SDK v6, Zod |
| **Database** | PostgreSQL with `periods` extension (bitemporal), Drizzle migrations |
| **Caching** | Redis (resumable streams, session state) |
| **Storage** | Vercel Blob (file uploads, artifacts) |
| **AI Providers** | Anthropic (Claude), Google (Gemini), OpenAI (GPT-4.1), xAI (Grok) |
| **Agent** | MCP Server v2 (43 tools, StdIO, JSON-RPC) |
| **Observability** | Vercel OTEL, Vercel Analytics |
| **Testing** | Playwright (E2E), TypeScript strict mode |

---

## 3. Request Lifecycle

### Chat Request Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Middleware as proxy.ts
    participant Auth as NextAuth
    participant ChatAPI as POST /api/chat
    participant AI as streamText()
    participant Tools as AI Tools
    participant DB as PostgreSQL
    participant Redis
    participant Stream as SSE Stream

    User->>Browser: Types message
    Browser->>Middleware: POST /api/chat
    Middleware->>Auth: getToken(req)
    Auth-->>Middleware: JWT payload
    Middleware->>ChatAPI: Authorized request

    ChatAPI->>DB: getMessagesByChatId()
    ChatAPI->>DB: saveChat() + saveMessages()
    
    ChatAPI->>AI: streamText(model, messages, tools)
    
    loop Tool Invocations (max 5 steps)
        AI->>Tools: e.g. getFeature(id)
        Tools->>DB: Query bitemporal table
        DB-->>Tools: Feature data
        Tools->>Stream: dataStream.write(delta)
        Tools-->>AI: Tool result
    end

    AI->>Stream: Text response chunks
    Stream->>Browser: SSE events
    Browser->>User: Rendered response + artifact

    ChatAPI->>DB: Save assistant message
    ChatAPI->>Redis: Store stream ID (resumable)
```

### Key Details

- **Rate Limiting**: Guest users get 20 messages/day, regular users get 50
- **Tool Limit**: AI can chain up to 5 tool steps per request (`stopWhen: stepCountIs(5)`)
- **System Prompt**: Enriched with live spec context + navigation context for smart tool selection
- **Resumability**: Stream IDs stored in Redis; if connection drops, client can resume from last position

---

## 4. Authentication & Authorization

```mermaid
flowchart TD
    REQ["Incoming Request"] --> PING{"/ping?"}
    PING -->|Yes| PONG["200 'pong'<br/>(Health Check)"]
    PING -->|No| AUTHPATH{"/api/auth/*?"}
    AUTHPATH -->|Yes| PASS["Pass Through"]
    AUTHPATH -->|No| TOKEN["getToken(req)"]
    
    TOKEN --> HASTOKEN{Token exists?}
    HASTOKEN -->|No| GUEST["/api/auth/guest<br/>Auto-create guest user"]
    HASTOKEN -->|Yes| CHECKGUEST{"Guest user?"}
    
    CHECKGUEST -->|Guest + /login| REDIRECT["Redirect → /"]
    CHECKGUEST -->|Otherwise| ALLOW["NextResponse.next()"]
    
    GUEST --> AUTOLOGIN["Create guest user<br/>+ auto-login"]
    AUTOLOGIN --> REDIRECT2["Redirect → /"]

    subgraph Auth Providers
        CRED["Email/Password<br/>bcrypt compare"]
        GUESTPROV["Guest Credential<br/>Auto-generated user"]
    end
```

### Session Shape

```typescript
interface Session {
  user: {
    id: string;       // UUID
    email: string;     // user@example.com or guest-xxx@guest.local
    type: "guest" | "regular";
  }
}
```

| User Type | Max Messages/Day | Features |
|-----------|-----------------|----------|
| `guest` | 20 | Full read/write, no persistence guarantee |
| `regular` | 50 | Full access, persistent history |

---

## 5. AI Provider Architecture

```mermaid
flowchart TD
    REQ["getLanguageModel(modelId)"] --> PARSE["Parse: provider/model<br/>e.g. 'anthropic/claude-haiku-4.5'"]
    
    PARSE --> REASON{"Reasoning<br/>model?"}
    REASON -->|Yes| WRAP["Wrap with<br/>extractReasoningMiddleware"]
    REASON -->|No| RESOLVE["resolveDirectModel()"]
    WRAP --> RESOLVE

    RESOLVE --> SWITCH{"Provider?"}
    SWITCH -->|anthropic| ANTH["anthropic(model)<br/>@ai-sdk/anthropic"]
    SWITCH -->|google| GOOG["google(model)<br/>@ai-sdk/google"]
    SWITCH -->|openai| OAI["openai(model)<br/>@ai-sdk/openai"]
    SWITCH -->|xai| XAI["xai(model)<br/>@ai-sdk/xai"]

    subgraph "Specialized Models"
        TITLE["getTitleModel()<br/>gemini-2.5-flash-lite"]
        ARTIFACT["getArtifactModel()<br/>claude-haiku-4.5"]
    end
```

### Available Models

| Provider | Model | Use Case |
|----------|-------|----------|
| Google | `gemini-2.5-flash-lite` | Default chat, title generation (cheap) |
| Google | `gemini-2.5-flash` | Fast reasoning |
| Google | `gemini-2.5-pro` | Complex analysis |
| Anthropic | `claude-haiku-4.5` | Artifact generation, fast tasks |
| Anthropic | `claude-sonnet-4.5` | Balanced quality/speed |
| Anthropic | `claude-opus-4.5` | Highest quality |
| OpenAI | `gpt-4.1` | General purpose |
| OpenAI | `o3-mini` | Reasoning |
| xAI | `grok-3-mini` | Alternative reasoning |

---

## 6. Copilot SDK Integration

The platform has a **dual-engine architecture**: users select a model in the UI, and the request is routed to either the **Copilot SDK** or the **standard Vercel AI SDK** based on the model prefix.

### Routing Decision

```mermaid
flowchart TD
    USER["User selects model in UI"] --> CHECK{"Model starts with<br/>'copilot/'?"}
    
    CHECK -->|"copilot/claude-opus-4.6"| COPILOT["POST /api/copilot-chat<br/>Copilot SDK Engine"]
    CHECK -->|"anthropic/claude-haiku-4.5"| STANDARD["POST /api/chat<br/>Vercel AI SDK Engine"]

    subgraph "Copilot SDK Path"
        COPILOT --> CLIENT["getCopilotClient()<br/>Singleton"]
        CLIENT --> SESSION["Create/Resume<br/>CopilotSession"]
        SESSION --> AGENTS["4 Custom Agents<br/>+ 28 MCP Tools"]
        AGENTS --> STREAM1["Streaming Response<br/>+ Agent Intent + Tool Status"]
    end

    subgraph "Standard SDK Path"
        STANDARD --> RESOLVE["resolveDirectModel()<br/>Provider SDK"]
        RESOLVE --> TOOLS["22 In-Process Tools"]
        TOOLS --> STREAM2["SSE Streaming<br/>+ Data Deltas"]
    end
```

### How the Copilot SDK Works

The Copilot SDK (`@github/copilot-sdk`) provides a **session-based agent runtime** that connects to GitHub's Copilot infrastructure. Unlike the standard path (direct API calls to LLM providers), it offers:

- **Persistent sessions** that maintain context across multiple turns
- **MCP tool access** — spawns the SPLM MCP server as a subprocess
- **Custom agents** with injected domain skills
- **File editing and shell execution** capabilities via agent tools

```mermaid
graph TB
    subgraph "Copilot SDK Runtime"
        CLIENT["CopilotClient<br/>Singleton"]
        
        subgraph "Connection Modes"
            AUTO["Auto-Spawn<br/>Local CLI process"]
            TCP["TCP Connection<br/>External CLI server<br/>(COPILOT_CLI_URL)"]
        end

        subgraph "Session"
            SESS["CopilotSession"]
            MODEL["Model Selection<br/>claude-opus-4.6<br/>gpt-4.1<br/>o3-pro<br/>gemini-2.5-pro"]
            SYS["System Message<br/>+ Project Context"]
        end

        subgraph "Capabilities"
            MCP["MCP Server (StdIO)<br/>28 SPLM Tools"]
            AGENTS["Custom Agents (4)"]
            SKILLS["Skill Directories<br/>Domain Guides"]
            FILES["File Edit/Create"]
            SHELL["Shell Execution"]
        end
    end

    CLIENT --> AUTO & TCP
    CLIENT --> SESS
    SESS --> MODEL & SYS
    SESS --> MCP & AGENTS & SKILLS & FILES & SHELL

    subgraph "GitHub Infrastructure"
        GH["GitHub Copilot<br/>Model Routing"]
        AUTH["GitHub PAT<br/>Authentication"]
    end

    CLIENT -->|"COPILOT_GITHUB_TOKEN"| AUTH
    AUTH --> GH
    GH -->|"Model inference"| SESS
```

### Available Copilot Models

These models are only visible when `NEXT_PUBLIC_USE_COPILOT_SDK=true`:

| Model ID | Provider | Notes |
|----------|----------|-------|
| `copilot/claude-opus-4.6` | Anthropic | Most capable, Copilot Pro+ |
| `copilot/claude-opus-4` | Anthropic | Powerful reasoning |
| `copilot/claude-sonnet-4` | Anthropic | Fast and capable |
| `copilot/gpt-4.1` | OpenAI | OpenAI flagship |
| `copilot/o3-pro` | OpenAI | Advanced reasoning |
| `copilot/gemini-2.5-pro` | Google | Google flagship |

### Custom Agents

The Copilot SDK path includes four specialized agents, each with injected skill guides from `splm-skills/`:

```mermaid
graph LR
    subgraph "Agent Routing"
        USER["User selects agent<br/>(or AI decides)"]
    end

    subgraph "Agents"
        TRIAGE["🔍 Triage Agent<br/>Priority, effort, risk<br/>assessment"]
        SPEC["📝 Spec Writer<br/>Write & edit specs<br/>from features"]
        IMPL["⚙️ Implementer<br/>Code changes,<br/>file editing"]
        REVIEW["🔎 Reviewer<br/>Code & spec<br/>quality review"]
    end

    subgraph "Shared Tools"
        MCP["28 MCP Tools<br/>(SPLM Server)"]
        FS["File System<br/>Read/Write/Edit"]
        CMD["Shell Commands<br/>Build/Test/Run"]
    end

    USER --> TRIAGE & SPEC & IMPL & REVIEW
    TRIAGE & SPEC & IMPL & REVIEW --> MCP & FS & CMD
```

### Session Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant API as /api/copilot-chat
    participant Client as CopilotClient
    participant Session as CopilotSession
    participant MCP as MCP Server
    participant GH as GitHub Copilot

    User->>Browser: Sends message (copilot model)
    Browser->>API: POST with message + sessionId?
    
    alt Existing Session
        API->>Client: resumeSession(sessionId)
        Client->>Session: Resume context
    else New Session
        API->>Client: createSession(config)
        Client->>MCP: Spawn MCP subprocess
        Client->>Session: Initialize with agents + skills
    end

    API->>Session: sendMessage(userMessage)
    Session->>GH: Model inference request

    loop Agent Execution
        GH-->>Session: assistant.intent (reasoning)
        Session-->>API: Stream intent to UI
        
        GH-->>Session: tool.execution_start
        Session->>MCP: Execute SPLM tool
        MCP-->>Session: Tool result
        Session-->>API: Stream tool status

        GH-->>Session: assistant.streaming_delta
        Session-->>API: Stream text chunks
        API-->>Browser: SSE events
    end

    GH-->>Session: assistant.message (complete)
    Session-->>API: Final message
    API->>API: Save to DB + track sessionId

    Note over API: Idle timeout: 3 min<br/>Max timeout: 15 min
```

### Copilot SDK vs Standard SDK — Feature Comparison

| Feature | Copilot SDK (`/api/copilot-chat`) | Standard SDK (`/api/chat`) |
|---------|----------------------------------|---------------------------|
| **Models** | 6 Copilot Pro+ models | 10+ direct provider models |
| **Session Persistence** | ✅ Multi-turn context | ❌ Stateless per request |
| **MCP Tools** | ✅ 28 SPLM tools | ❌ No MCP |
| **Custom Agents** | ✅ 4 role-based agents | ❌ Single assistant |
| **Skill Injection** | ✅ Domain-specific guides | ❌ System prompt only |
| **File Editing** | ✅ Via agent tools | ❌ No filesystem access |
| **Shell Execution** | ✅ Via agent tools | ❌ No shell access |
| **Agent Intent** | ✅ Visible reasoning | ❌ No reasoning display |
| **Extended Thinking** | ❌ Not available | ✅ With reasoning models |
| **Artifact Streaming** | ❌ Text-only response | ✅ Rich delta types |
| **Live Spec Context** | ❌ Not injected | ✅ Injected into prompt |
| **Timeout** | 3min idle / 15min max | ~60s per request |
| **Authentication** | GitHub PAT | Direct API keys |

---

## 7. Streaming & Real-Time Data Flow

```mermaid
sequenceDiagram
    participant Tool as AI Tool
    participant DS as dataStream
    participant SSE as SSE Response
    participant DSH as DataStreamHandler
    participant State as Artifact State
    participant UI as Artifact Component

    Tool->>DS: write({ type: "data-kind", data: "feature" })
    Tool->>DS: write({ type: "data-id", data: "uuid-123" })
    Tool->>DS: write({ type: "data-title", data: "My Feature" })
    Tool->>DS: write({ type: "data-clear" })
    
    loop Streaming Content
        Tool->>DS: write({ type: "data-featureDelta", data: chunk })
        DS->>SSE: SSE event
        SSE->>DSH: EventSource message
        DSH->>State: setArtifact({ content += chunk })
        State->>UI: Re-render with partial content
    end

    Tool->>DS: write({ type: "data-finish" })
    DS->>SSE: Final event
    SSE->>DSH: Stream complete
    DSH->>State: setArtifact({ status: "idle" })
```

### Delta Types

| Delta Type | Purpose | Artifact Kind |
|------------|---------|---------------|
| `data-textDelta` | Markdown content | `text` |
| `data-codeDelta` | Source code | `code` |
| `data-specDelta` | Specification markdown | `spec` |
| `data-featureDelta` | Feature JSON | `feature` |
| `data-bugDelta` | Bug JSON | `bug` |
| `data-sheetDelta` | Spreadsheet data | `sheet` |
| `data-backlogDelta` | Backlog JSON | `backlog` |
| `data-capabilityDelta` | Capability JSON | `capability` |
| `data-roadmapDelta` | Roadmap JSON | `roadmap` |

---

## 8. Database Architecture

### Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Chat : "owns"
    User ||--o{ Document : "creates"
    Chat ||--o{ Message_v2 : "contains"
    Document ||--o{ Suggestion : "has"

    User ||--o{ Feature : "maintains"
    User ||--o{ Bug : "maintains"
    Feature ||--o{ Feature : "parent/sub"
    Feature ||--o{ Task : "has"
    Bug ||--o{ Task : "has"

    Feature ||--o{ Backlog : "promoted to"
    Bug ||--o{ Backlog : "promoted to"

    Feature ||--o{ DocumentLink : "source"
    Bug ||--o{ DocumentLink : "source"
    Task ||--o{ DocumentLink : "source"

    Capability ||--o{ CapabilityItem : "groups"
    Feature ||--o{ CapabilityItem : "assigned"
    Bug ||--o{ CapabilityItem : "assigned"

    Milestone ||--o{ MilestoneItem : "tracks"
    Repository ||--o{ Milestone : "has"
    Feature ||--o{ MilestoneItem : "scheduled"
    Bug ||--o{ MilestoneItem : "scheduled"

    User {
        uuid id PK
        string email
        string password
        boolean systemUser
    }

    Chat {
        uuid id PK
        uuid userId FK
        string title
        string visibility
        timestamp createdAt
    }

    Message_v2 {
        uuid id PK
        uuid chatId FK
        string role
        jsonb parts
        jsonb attachments
        timestamp createdAt
    }

    Document {
        uuid id PK
        string title
        text content
        string kind
        uuid userId FK
        timestamp createdAt
    }

    Feature {
        uuid id
        uuid version_id PK
        string title
        text description
        string status
        string priority
        string feature_type
        uuid parent_id FK
        jsonb ai_metadata
        timestamp valid_from
        timestamp valid_to
    }

    Bug {
        uuid id
        uuid version_id PK
        string title
        string severity
        string status
        string priority
        jsonb ai_metadata
        timestamp valid_from
        timestamp valid_to
    }

    Task {
        uuid id PK
        uuid parent_id FK
        string parent_type
        string title
        string status
        string priority
    }

    Backlog {
        uuid id PK
        string item_type
        uuid item_id FK
        integer backlog_rank
        string sprint_label
    }

    Capability {
        uuid id PK
        string name
        string sdlc_phase
        string status
    }

    Milestone {
        uuid id PK
        uuid repository_id FK
        string title
        string status
        date target_date
        integer capacity
    }

    Repository {
        uuid id PK
        string name
        string github_url
        string status
    }

    DocumentLink {
        uuid id PK
        string source_type
        uuid source_id
        string target_type
        uuid target_id
        string link_type
    }
```

### Bitemporal Versioning

```mermaid
graph LR
    subgraph "Feature: 'User Auth' History"
        V1["Version 1<br/>status: draft<br/>valid: Jan 1 → Jan 15"]
        V2["Version 2<br/>status: backlog<br/>valid: Jan 15 → Feb 1"]
        V3["Version 3<br/>status: implementation<br/>valid: Feb 1 → Present"]
    end

    V1 -->|"promote"| V2
    V2 -->|"start work"| V3
```

Every SPLM entity (features, bugs, tasks) uses **bitemporal versioning**:

- **`valid_from` / `valid_to`**: When this version of the data was/is valid in the real world
- **Transaction time**: When the row was written to the database (managed by PostgreSQL `periods` extension)
- **`version_id`**: Each mutation creates a new row; the previous row's `valid_to` is set to `now()`
- **Current state**: Query with `valid_to IS NULL` or `valid_to > now()`

### Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> triage : triage_item()
    triage --> rejected : reject
    triage --> backlog : promote_to_backlog()
    backlog --> spec_generation : generate_spec()
    spec_generation --> implementation : update_feature(status)
    implementation --> testing : update_feature(status)
    testing --> done : update_feature(status)
    testing --> implementation : issues found
    done --> [*]
    rejected --> [*]
```

---

## 9. MCP Server (Agent Layer)

```mermaid
graph TB
    subgraph "External Clients"
        VSCODE["VS Code<br/>Copilot Agent"]
        CLI["CLI Tools"]
        CURSOR["Cursor / Other IDEs"]
    end

    subgraph "MCP Server (Node.js Process)"
        TRANSPORT["StdIO Transport<br/>JSON-RPC Protocol"]
        SERVER["MCP Server v2.0.0<br/>@modelcontextprotocol/sdk"]
        
        subgraph "43 Tool Handlers"
            SPEC["Spec Tools (7)"]
            FEAT["Feature Tools (4)"]
            BUG["Bug Tools (4)"]
            TASK["Task Tools (4)"]
            BL["Backlog Tools (3)"]
            DOC["Document Tools (3)"]
            AI_T["AI Analysis (5)"]
            REPO["Repository Tools (4)"]
            CAP["Capability Tools (7)"]
            MILE["Milestone Tools (7)"]
        end

        DB_LAYER["Database Layer<br/>Direct pg client"]
    end

    subgraph "Shared Database"
        PG["PostgreSQL<br/>Bitemporal Tables"]
    end

    VSCODE -->|stdin/stdout| TRANSPORT
    CLI -->|stdin/stdout| TRANSPORT
    CURSOR -->|stdin/stdout| TRANSPORT
    TRANSPORT --> SERVER
    SERVER --> SPEC & FEAT & BUG & TASK & BL & DOC & AI_T & REPO & CAP & MILE
    SPEC & FEAT & BUG & TASK & BL & DOC & AI_T & REPO & CAP & MILE --> DB_LAYER
    DB_LAYER --> PG
```

### MCP vs Chat Tools

The platform has **two tool surfaces** that share the same database:

| Aspect | Chat AI Tools (22) | MCP Server Tools (43) |
|--------|-------------------|----------------------|
| **Transport** | In-process function calls | StdIO JSON-RPC |
| **Consumer** | Chat API (browser users) | VS Code, CLI, external agents |
| **Streaming** | Yes (dataStream deltas) | No (request/response) |
| **Auth** | NextAuth session | `MCP_ASSISTANT_USER_ID` |
| **Scope** | Read + write + UI updates | Read + write (headless) |
| **AI Analysis** | triage, duplicates, impact | Same + spec generation |

---

## 10. Artifact System

```mermaid
flowchart TD
    subgraph "Artifact Kinds"
        TEXT["text<br/>Markdown documents"]
        CODE["code<br/>Source files"]
        SHEET["sheet<br/>Spreadsheet data"]
        IMAGE["image<br/>Generated images"]
        SPEC["spec<br/>Specifications"]
        FEAT["feature<br/>Feature definitions"]
        BUGK["bug<br/>Bug reports"]
        BL["backlog<br/>Backlog view"]
        SKILL["skill<br/>AI skills"]
        TMPL["template<br/>Prompt templates"]
        REPOK["repository<br/>Repo management"]
        CAPK["capability<br/>Capability areas"]
        ROAD["roadmap<br/>Roadmap view"]
        MILEK["milestone<br/>Release milestones"]
    end

    subgraph "Storage"
        DOCTBL["Document Table<br/>(Chat system)"]
        BITEMP["Bitemporal Tables<br/>(SPLM system)"]
        BLOBST["Vercel Blob<br/>(File uploads)"]
    end

    TEXT & CODE & SHEET & IMAGE --> DOCTBL
    SPEC & FEAT & BUGK --> BITEMP
    IMAGE -->|"uploads"| BLOBST
```

### Artifact Lifecycle

```mermaid
stateDiagram-v2
    [*] --> UserRequest : User asks AI
    UserRequest --> ToolCall : AI selects tool
    ToolCall --> Streaming : dataStream.write(deltas)
    Streaming --> Rendered : DataStreamHandler processes
    Rendered --> Editing : User edits in panel
    Editing --> Saved : Save triggers updateDocument tool
    Saved --> NewVersion : Bitemporal new version row
    NewVersion --> Rendered : UI refreshes
```

Each artifact kind has a dedicated handler with:
- `onCreateDocument()` — Initial AI-powered generation
- `onUpdateDocument()` — Content updates (re-generation or manual)
- `onStreamPart()` — Client-side delta processing

---

## 11. API Routes

```mermaid
graph TD
    subgraph "Authentication"
        A1["POST /api/auth/[...nextauth]"]
        A2["GET /api/auth/guest"]
    end

    subgraph "Chat System"
        B1["POST /api/chat — Stream chat"]
        B2["DELETE /api/chat — Delete chat"]
        B3["PATCH /api/chat — Update message"]
        B4["GET /api/chat/:id/stream — Resume stream"]
        B5["POST /api/files/upload — Blob upload"]
        B6["GET /api/suggestions — Doc suggestions"]
    end

    subgraph "Documents"
        C1["GET /api/document"]
        C2["POST /api/document"]
        C3["PATCH /api/document"]
        C4["GET /api/spec-document"]
        C5["POST /api/spec-document"]
    end

    subgraph "SPLM Entities"
        D1["GET/POST /api/features"]
        D2["GET/POST /api/bugs"]
        D3["GET/POST /api/tasks"]
        D4["GET/POST /api/backlog"]
        D5["GET/POST /api/capabilities"]
        D6["GET/POST /api/milestones"]
        D7["GET/POST /api/repositories"]
        D8["GET/POST /api/item-links"]
    end
```

---

## 12. Deployment Options

### Chosen Architecture: Remote Dev Server + Supabase

Based on your infrastructure (Supabase Pro Cloud + local Docker, need for multi-device access with full Copilot SDK codebase capabilities):

```mermaid
graph TB
    subgraph "Any Device (iPad / Laptop / Phone)"
        BROWSER["Browser<br/>HTTPS"]
    end

    subgraph "VPS (Hetzner / DigitalOcean / Fly.io)"
        CADDY["Caddy<br/>HTTPS + Auto-TLS"]
        APP["Next.js App<br/>(persistent node process)"]
        COPILOT["CopilotClient<br/>+ MCP Server"]
        REDIS["Redis 7"]
        
        subgraph "Git Repos (on disk)"
            REPO1["~/repos/spec-driven-dev-v2"]
            REPO2["~/repos/odulphi"]
            REPO3["~/repos/other-project"]
        end
    end

    subgraph "Supabase Cloud (Pro)"
        SUPA_DB["PostgreSQL<br/>Schema: splm"]
        SUPA_AUTH["Supabase Auth<br/>(optional future)"]
        SUPA_STORE["Supabase Storage<br/>(replaces Vercel Blob)"]
    end

    subgraph "External"
        LLM["LLM Providers<br/>Anthropic / Google / OpenAI / xAI"]
        GH["GitHub<br/>(push/pull)"]
    end

    BROWSER --> CADDY --> APP
    APP --> COPILOT
    COPILOT --> REPO1 & REPO2 & REPO3
    APP -->|"Schema: splm"| SUPA_DB
    APP --> SUPA_STORE
    APP --> REDIS
    APP --> LLM
    COPILOT -->|"git push/pull"| GH
    REPO1 & REPO2 & REPO3 --> GH
```

### Why This Architecture

| Requirement | Solution |
|------------|---------|
| Multi-device access | VPS with HTTPS — works from any browser |
| Copilot SDK file editing | Persistent filesystem with cloned repos |
| Shell execution (build/test) | Full Linux environment |
| Database sharing with other project | Supabase with dedicated `splm` schema |
| Schema sync via MCP | Supabase MCP tools for migrations |
| Cost effective | ~$5-15/mo VPS + existing Supabase Pro |

---

### Supabase Integration (Custom Schema)

Since the `public` schema is used by another project, SPLM uses a dedicated `splm` schema:

```mermaid
graph LR
    subgraph "Supabase PostgreSQL"
        subgraph "public schema"
            OTHER["Other Project Tables<br/>(Odulphi)"]
        end
        subgraph "splm schema"
            DRIZZLE["Drizzle Tables<br/>User, Chat, Message_v2,<br/>Document, Suggestion, Stream"]
            BITEMP["Bitemporal Tables<br/>features, bugs, tasks,<br/>backlog_items, capabilities,<br/>milestones, repositories"]
            VIEWS["Views<br/>current_features,<br/>current_bugs, etc."]
            FUNCS["PL/pgSQL Functions<br/>create_feature_version(),<br/>update_feature_version(), etc."]
        end
    end
```

#### Schema Refactoring Required

The codebase currently uses the default `public` schema everywhere. Three layers need updating:

```mermaid
flowchart TD
    subgraph "Layer 1: Drizzle ORM (Low Effort)"
        D1["drizzle.config.ts<br/>Add schemaFilter: ['splm']"]
        D2["lib/db/schema.ts<br/>Add pgSchema('splm') to tables"]
        D3["Regenerate migrations"]
    end

    subgraph "Layer 2: Raw SQL in App (High Effort)"
        S1["lib/db/bitemporal-work-items.ts<br/>~200 table references"]
        S2["lib/db/bitemporal-queries.ts<br/>~50 table references"]
        S3["lib/db/queries.ts<br/>~20 table references"]
    end

    subgraph "Layer 3: MCP Server (Medium Effort)"
        M1["mcp-server/src/db.ts<br/>~20 table references"]
        M2["SET search_path = splm<br/>on connection"]
    end

    subgraph "Layer 4: SQL Definitions (Medium Effort)"
        Q1["database/splm-schema.sql"]
        Q2["database/consolidated-splm-setup.sql"]
        Q3["PL/pgSQL functions"]
    end

    D1 --> D2 --> D3
    S1 --> S2 --> S3
    M1 --> M2
    Q1 --> Q2 --> Q3
```

#### Recommended Approach: `search_path` + Selective Prefixing

Instead of prefixing every single table reference with `splm.`, use PostgreSQL's `search_path`:

```sql
-- On connection (both app and MCP server):
SET search_path TO splm, public;
```

This means:
- **Drizzle tables** → found in `splm` schema automatically
- **Bitemporal tables** → found in `splm` schema automatically  
- **Raw SQL queries** → no changes needed (search_path resolves them)
- **Only explicit `public.` references** need updating (if any)

**Implementation:**

| File | Change | Effort |
|------|--------|--------|
| `drizzle.config.ts` | Add `schemaFilter: ["splm"]` | 1 line |
| `lib/db/schema.ts` | Add `export const splmSchema = pgSchema("splm")` + update table defs | Medium |
| `lib/db/index.ts` | Add `SET search_path TO splm` after connection | 1 line |
| `mcp-server/src/db.ts` | Add `SET search_path TO splm` after pool connect | 1 line |
| `database/splm-schema.sql` | Add `CREATE SCHEMA IF NOT EXISTS splm; SET search_path TO splm;` at top | 2 lines |
| `database/consolidated-splm-setup.sql` | Full schema with `SET search_path TO splm;` | Already done |
| Drizzle migrations | Regenerate after schema change | Auto |

**Total effort with `search_path` approach: ~2-3 hours** (vs 6-8 hours for full prefixing).

#### Supabase Connection String

```bash
# .env.local
POSTGRES_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?options=-c%20search_path%3Dsplm
```

Note: The `?options=-c search_path=splm` sets the schema on every connection from the connection string itself — no code changes needed for `search_path` if your driver supports it.

---

### Docker Compose for Remote Dev Server

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    volumes:
      - repos:/home/app/repos          # Persistent repo storage
      - ./splm-skills:/app/splm-skills  # Skill files
    environment:
      - POSTGRES_URL=postgresql://postgres.[ref]:[pass]@pooler.supabase.com:6543/postgres?options=-c%20search_path%3Dsplm
      - REDIS_URL=redis://redis:6379
      - AUTH_SECRET=${AUTH_SECRET}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY}
      - USE_COPILOT_SDK=true
      - NEXT_PUBLIC_USE_COPILOT_SDK=true
      - COPILOT_GITHUB_TOKEN=${COPILOT_GITHUB_TOKEN}
      - ACTIVE_REPO_PATH=/home/app/repos/spec-driven-dev-v2  # Default repo
    depends_on: [redis]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [app]
    restart: unless-stopped

volumes:
  repos:
  redisdata:
  caddy_data:
```

**Caddyfile:**
```
splm.yourdomain.com {
    reverse_proxy app:3000
}
```

---

## 13. Remote Codebase Access — Multi-Repo Switching

### The Architecture

The Copilot SDK's `workingDirectory` config determines which repo the agents operate on. To switch repos, we need a way to change this at runtime.

```mermaid
flowchart TD
    subgraph "Browser UI"
        SELECTOR["Repo Selector<br/>(dropdown in header)"]
        CHAT["Chat Interface"]
    end

    subgraph "VPS"
        API["/api/copilot-chat"]
        CONFIG["Session Config<br/>workingDirectory: ?"]
        
        subgraph "Repos on Disk"
            R1["~/repos/spec-driven-dev-v2<br/>This project"]
            R2["~/repos/odulphi<br/>Next.js + Supabase app"]
            R3["~/repos/totalmix-streamdeck<br/>Stream Deck plugin"]
        end
    end

    SELECTOR -->|"selectedRepo"| API
    API --> CONFIG
    CONFIG -->|"spec-driven-dev-v2"| R1
    CONFIG -->|"odulphi"| R2
    CONFIG -->|"totalmix-streamdeck"| R3
```

### How Repo Switching Works

```mermaid
sequenceDiagram
    actor User
    participant UI as Repo Selector
    participant API as /api/copilot-chat
    participant Client as CopilotClient
    participant Session as CopilotSession

    User->>UI: Select "odulphi" from dropdown
    UI->>API: POST { repo: "odulphi", message: "..." }
    
    API->>API: Resolve repo path<br/>~/repos/odulphi
    
    alt Different repo than current session
        API->>Client: createSession({<br/>  workingDirectory: "~/repos/odulphi",<br/>  mcpServers: { splm: {...} }<br/>})
        Note over API: New session = new working dir
    else Same repo
        API->>Client: resumeSession(sessionId)
    end

    Client->>Session: Agent operates in ~/repos/odulphi
    Session-->>API: File edits, shell commands scoped to repo
```

### Implementation Design

#### 1. Repo Registry (Config or DB)

Define available repos on the server:

```typescript
// lib/copilot/repos.ts
interface RepoConfig {
  id: string;
  name: string;
  path: string;           // Absolute path on VPS
  description: string;
  mcpServers?: Record<string, MCPConfig>;  // Per-repo MCP tools
  skills?: string[];      // Per-repo skill directories
}

const repos: RepoConfig[] = [
  {
    id: "spec-driven-dev-v2",
    name: "SPLM Platform",
    path: "/home/app/repos/spec-driven-dev-v2",
    description: "This project — spec-driven development platform",
    mcpServers: { splm: { /* ... */ } },
    skills: ["splm-skills"],
  },
  {
    id: "odulphi",
    name: "Odulphi",
    path: "/home/app/repos/odulphi",
    description: "Next.js + Supabase app with offline support",
    mcpServers: { supabase: { /* ... */ } },
    skills: ["odulphi-skills"],
  },
  {
    id: "totalmix-streamdeck",
    name: "TotalMix Stream Deck",
    path: "/home/app/repos/totalmix-streamdeck",
    description: "Stream Deck plugin for RME TotalMix FX",
  },
];
```

#### 2. API Endpoint for Repo List

```typescript
// GET /api/repos → returns available repos
// Used by the UI repo selector dropdown
```

#### 3. Session-per-Repo Strategy

```mermaid
graph TB
    subgraph "Session Management"
        MAP["chatSessionMap<br/>Map<chatId, { sessionId, repoId }>"]
    end

    subgraph "Scenario: User switches repo mid-chat"
        MSG1["Message 1: repo=splm<br/>→ Session A (splm dir)"]
        MSG2["Message 2: repo=splm<br/>→ Resume Session A"]
        MSG3["Message 3: repo=odulphi<br/>→ NEW Session B (odulphi dir)"]
        MSG4["Message 4: repo=odulphi<br/>→ Resume Session B"]
    end

    MSG1 --> MSG2
    MSG2 -->|"repo change!"| MSG3
    MSG3 --> MSG4
```

Key rule: **switching repos forces a new Copilot session** because `workingDirectory` is set at session creation time. The old session context (for the previous repo) is lost. This is by design — you don't want file-edit context from one repo bleeding into another.

#### 4. Per-Repo MCP Servers

Different repos can have different MCP tool configurations:

```mermaid
graph TB
    subgraph "SPLM Platform repo"
        MCP1["MCP: SPLM Server<br/>28 spec/feature/bug tools"]
    end

    subgraph "Odulphi repo"
        MCP2["MCP: Supabase Server<br/>Schema sync, migrations"]
        MCP3["MCP: SPLM Server<br/>(optional, shared DB)"]
    end

    subgraph "TotalMix repo"
        MCP4["No MCP<br/>(file + shell only)"]
    end
```

#### 5. Git Auto-Sync

Each repo on the VPS should stay in sync with GitHub:

```mermaid
flowchart LR
    CRON["Cron Job<br/>every 5 min"] --> PULL["git pull --rebase<br/>for each repo"]
    PUSH["After agent edits"] --> COMMIT["git add + commit"] --> GPUSH["git push"]
```

```bash
# /etc/cron.d/repo-sync
*/5 * * * * app cd /home/app/repos/spec-driven-dev-v2 && git pull --rebase --quiet
*/5 * * * * app cd /home/app/repos/odulphi && git pull --rebase --quiet
```

Or better: the Copilot agent handles git operations itself (commit, push, create branches) as part of its workflow.

### Full Multi-Repo Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as Browser (iPad)
    participant API as VPS: /api/copilot-chat
    participant Copilot as CopilotSession
    participant FS as ~/repos/odulphi
    participant Shell as Shell (build/test)
    participant GH as GitHub

    User->>UI: Select repo: "Odulphi"
    User->>UI: "Add a dark mode toggle to the settings page"
    UI->>API: POST { repo: "odulphi", message: "..." }
    
    API->>Copilot: createSession({<br/>  workingDirectory: ~/repos/odulphi,<br/>  mcpServers: { supabase: {...} }<br/>})

    Copilot->>FS: Read components/settings/page.tsx
    Copilot->>FS: Read app/globals.css
    Copilot->>Copilot: Plan implementation
    
    Copilot->>FS: Create components/settings/dark-mode-toggle.tsx
    Copilot->>FS: Edit components/settings/page.tsx
    Copilot->>Shell: pnpm build (verify no errors)
    Shell-->>Copilot: Build succeeded ✓
    
    Copilot->>Shell: git checkout -b feat/dark-mode
    Copilot->>Shell: git add -A && git commit -m "Add dark mode toggle"
    Copilot->>Shell: git push origin feat/dark-mode
    Shell->>GH: Push branch
    
    Copilot-->>API: "Done! Created branch feat/dark-mode with the toggle."
    API-->>UI: Stream response
    UI-->>User: See result + link to PR
```

---

### Previous Options (Reference)

<details>
<summary>Option A: Vercel (Serverless — no codebase access)</summary>

```mermaid
graph TB
    subgraph "Vercel Platform"
        EDGE["Edge Network<br/>Global CDN"]
        FN["Serverless Functions<br/>Next.js API Routes"]
        VPG["Vercel Postgres<br/>Managed PostgreSQL"]
        VKV["Vercel KV<br/>Managed Redis"]
        VB["Vercel Blob<br/>Object Storage"]
    end

    subgraph "External"
        LLM["LLM Providers"]
        GH["GitHub<br/>Source + CI/CD"]
    end

    GH -->|"git push"| EDGE
    EDGE --> FN
    FN --> VPG & VKV & VB
    FN -->|"API calls"| LLM
```

Works for SPLM-only (no file editing). All `@vercel/*` packages are first-class. Zero infra management.

</details>

<details>
<summary>Option B: Hybrid (Vercel + External DB)</summary>

Deploy app on Vercel, point `POSTGRES_URL` at Supabase. Keeps deployment simplicity but no codebase access.

</details>

---

## 13. Refactoring Checklist

### Phase 1: Supabase Schema Migration

```mermaid
gantt
    title Schema Migration to Supabase (splm schema)
    dateFormat X
    axisFormat %s hrs

    section Database Setup
    Create splm schema on Supabase      :done, a1, 0, 1
    Run splm-schema.sql with SET search_path :a2, 1, 3
    Run migration SQLs with SET search_path  :a3, 3, 4

    section Drizzle ORM
    Update drizzle.config.ts (schemaFilter)  :b1, 4, 5
    Add pgSchema to lib/db/schema.ts         :b2, 5, 7
    Regenerate Drizzle migrations            :b3, 7, 8

    section Connection Layer
    Add search_path to POSTGRES_URL          :c1, 8, 9
    Add search_path fallback in lib/db/index :c2, 9, 10
    Add search_path in mcp-server/src/db.ts  :c3, 9, 10

    section Testing
    Verify app against Supabase              :d1, 10, 12
    Verify MCP server queries                :d2, 10, 12
    Test bitemporal operations               :d3, 12, 14
```

### Phase 2: VPS Setup

```mermaid
gantt
    title Remote Dev Server Setup
    dateFormat X
    axisFormat %s hrs

    section Infrastructure
    Provision VPS (Hetzner/DO)           :a1, 0, 1
    Install Docker + Docker Compose      :a2, 1, 2
    Configure DNS + Caddy (auto-TLS)     :a3, 2, 4

    section Application
    Clone repos to ~/repos/              :b1, 4, 5
    Configure .env with Supabase URL     :b2, 5, 6
    Docker Compose up                    :b3, 6, 7
    Test from browser                    :b4, 7, 8

    section Multi-Repo
    Add repo registry config             :c1, 8, 10
    Add repo selector to UI              :c2, 10, 13
    Update copilot-chat route            :c3, 10, 13
    Test repo switching                  :c4, 13, 15
```

### Phase 3: Multi-Repo UI

Add a repo selector to the chat interface that controls which codebase the Copilot SDK agents operate on. See [Section 12](#12-deployment-options) for the full multi-repo switching architecture.

**Files to create/modify:**
- `lib/copilot/repos.ts` — Repo registry configuration
- `GET /api/repos` — API endpoint for available repos
- `components/repo-selector.tsx` — Dropdown in chat header
- `app/(chat)/api/copilot-chat/route.ts` — Accept `repo` param, create session with correct `workingDirectory`

---

## 14. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | **Yes** | NextAuth JWT signing secret. Generate: `openssl rand -base64 32` |
| `POSTGRES_URL` | **Yes** | Supabase connection string with `?options=-c search_path=splm` |
| `BLOB_READ_WRITE_TOKEN` | VPS: No | Vercel Blob token (replace with Supabase Storage on VPS) |
| `REDIS_URL` | Recommended | Redis URL for resumable streams |
| `ANTHROPIC_API_KEY` | If using Anthropic | Claude API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If using Google | Gemini API key |
| `OPENAI_API_KEY` | If using OpenAI | GPT API key |
| `XAI_API_KEY` | If using xAI | Grok API key |
| `CHAT_ASSISTANT_USER_ID` | **Yes** | UUID for the chat AI system user |
| `MCP_ASSISTANT_USER_ID` | **Yes** | UUID for the MCP agent system user |
| `NEXT_PUBLIC_USE_COPILOT_SDK` | **Yes** | `true` to enable GitHub Copilot SDK (client) |
| `USE_COPILOT_SDK` | **Yes** | `true` to enable GitHub Copilot SDK (server) |
| `COPILOT_GITHUB_TOKEN` | **Yes** | GitHub PAT with Copilot Pro+ access |
| `COPILOT_CLI_URL` | Optional | External Copilot CLI server URL (omit to auto-spawn) |
| `ACTIVE_REPO_PATH` | VPS only | Default repo path for Copilot SDK agents |

### Production .env (VPS + Supabase)

```bash
# Database — Supabase Pro (splm schema)
POSTGRES_URL=postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?options=-c%20search_path%3Dsplm

# Auth
AUTH_SECRET=<openssl rand -base64 32>

# Redis (local on VPS)
REDIS_URL=redis://redis:6379

# AI Providers (direct, no gateway)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AI...
OPENAI_API_KEY=sk-...

# System Users
CHAT_ASSISTANT_USER_ID=<uuid>
MCP_ASSISTANT_USER_ID=<uuid>

# Copilot SDK
NEXT_PUBLIC_USE_COPILOT_SDK=true
USE_COPILOT_SDK=true
COPILOT_GITHUB_TOKEN=ghp_...

# Multi-repo
ACTIVE_REPO_PATH=/home/app/repos/spec-driven-dev-v2
```

---

## Quick Start (VPS + Supabase)

```bash
# 1. On Supabase: Create the splm schema
# Via Supabase SQL Editor or MCP:
CREATE SCHEMA IF NOT EXISTS splm;

# 2. On VPS: Clone and set up
ssh your-vps
mkdir -p ~/repos && cd ~/repos
git clone git@github.com:you/spec-driven-dev-v2.git
git clone git@github.com:you/odulphi.git
# ... more repos

# 3. Configure
cd spec-driven-dev-v2
cp .env.example .env.local   # Fill in Supabase URL + API keys

# 4. Build MCP server
pnpm install
cd mcp-server && pnpm build && cd ..

# 5. Run database migrations
pnpm run db:migrate           # Drizzle migrations → splm schema
psql $POSTGRES_URL -f database/splm-schema.sql  # Bitemporal tables

# 6. Start with Docker Compose
docker compose up -d

# 7. Access from any device
# https://splm.yourdomain.com
```

---

*Generated: April 2026*
