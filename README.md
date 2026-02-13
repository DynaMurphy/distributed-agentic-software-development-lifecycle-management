# Spec-Driven Development v2

AI-powered document editor for crafting specifications, requirements, and technical documentation. Built on the [Vercel Chat SDK](https://github.com/vercel/ai-chatbot) with a [Syncfusion Document Editor](https://www.syncfusion.com/react-ui-components/react-word-processor) replacing ProseMirror.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Chat Interface (AI SDK + useChat)                      │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │  Chat Panel   │  │  Syncfusion Document Editor     │  │
│  │  - Messages   │  │  - WYSIWYG editing              │  │
│  │  - AI input   │  │  - Toolbar & formatting         │  │
│  │  - Model      │  │  - Track changes / revisions    │  │
│  │    selector   │  │  - Version history              │  │
│  └──────────────┘  └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Conversion Layer:  Markdown ↔ SFDT (lib/sfdt/)         │
├─────────────────────────────────────────────────────────┤
│  AI Providers:  Vercel AI Gateway (multi-provider)      │
│  Anthropic · Google · xAI                               │
├─────────────────────────────────────────────────────────┤
│  Database:  PostgreSQL                                  │
│  - Bitemporal document versioning (periods extension)   │
│  - Chat/message history (Drizzle ORM)                   │
├─────────────────────────────────────────────────────────┤
│  MCP Server:  AI agent tooling for spec documents       │
│  - read_spec · append_spec_note · propose_spec_change   │
└─────────────────────────────────────────────────────────┘
```

## Key Features

- **AI Chat Interface** — Conversational AI that creates and edits specification documents
- **Syncfusion Document Editor** — Full WYSIWYG document editing with formatting toolbar, track changes, and revision history
- **Multi-Provider AI** — Choose between Anthropic Claude, Google Gemini, xAI Grok (no OpenAI dependency)
- **Markdown ↔ SFDT Conversion** — AI generates markdown, automatically converted to rich document format
- **Bitemporal Versioning** — Full document history with both valid-time and transaction-time tracking
- **MCP Server** — External AI agents can read, annotate, and propose changes to specs
- **Auth** — NextAuth v5 with login/registration

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

# Run database migrations
pnpm db:migrate

# If using the bitemporal schema from the original project:
psql -d spec_docs -f database/schema.sql

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
├── artifacts/              # Artifact type definitions
│   ├── text/               # Text artifact (Syncfusion editor)
│   │   ├── client.tsx      # Client-side renderer + streaming
│   │   └── server.ts       # Server-side AI generation
│   ├── code/               # Code editor artifact
│   ├── image/              # Image artifact
│   └── sheet/              # Spreadsheet artifact
├── components/
│   ├── syncfusion-editor.tsx  # Syncfusion Document Editor wrapper
│   ├── text-editor.tsx        # Dynamic import wrapper (SSR-safe)
│   ├── artifact.tsx           # Artifact panel layout
│   ├── chat.tsx               # Main chat component
│   └── ...                    # UI components (shadcn/ui + Radix)
├── lib/
│   ├── sfdt/               # Markdown ↔ SFDT conversion layer
│   │   └── index.ts        # markdownToSfdt, sfdtToMarkdown, applyRevision
│   ├── ai/                 # AI provider config + tools
│   │   ├── providers.ts    # Vercel AI Gateway setup
│   │   ├── models.ts       # Available model definitions
│   │   └── tools/          # createDocument, updateDocument, etc.
│   ├── db/                 # Database (Drizzle ORM)
│   └── artifacts/          # Server-side artifact handlers
├── database/               # Bitemporal SQL schema
│   └── schema.sql          # PostgreSQL periods extension setup
└── mcp-server/             # MCP server for AI agent access
    └── src/
        ├── index.ts        # MCP tool definitions
        ├── db.ts           # Database connection
        └── sfdt-utils.ts   # SFDT manipulation utilities
```

## How It Works

1. **User sends a message** in the chat → AI decides to create/update a document
2. **AI streams markdown content** via `data-textDelta` stream parts
3. **Client accumulates markdown** in the artifact state
4. **Syncfusion editor** receives content via the conversion layer:
   - During streaming: throttled updates (every ~500ms) convert markdown → SFDT → `editor.open()`
   - On completion: final complete conversion and load
5. **User edits** in Syncfusion → serialize SFDT → convert to markdown → save
6. **Version history** stored in PostgreSQL (bitemporal or Chat SDK compound key)

## AI Model Configuration

Models are configured in `lib/ai/models.ts`. The default setup uses Vercel AI Gateway for provider-agnostic access:

| Provider | Models | Use Case |
|----------|--------|----------|
| Anthropic | Claude Haiku 4.5, Sonnet 4.5, Opus 4.5 | Chat + Artifacts |
| Google | Gemini 2.5 Flash Lite, Gemini 3 Pro | Default chat model |
| xAI | Grok 4.1 Fast | Fast responses |
| Reasoning | Claude 3.7 Sonnet, Grok Code Fast | Complex analysis |

## Based On

- [Vercel Chat SDK](https://github.com/vercel/ai-chatbot) — Chat interface, artifact system, AI streaming
- [Syncfusion EJ2 Document Editor](https://www.syncfusion.com/react-ui-components/react-word-processor) — Rich text editing
- [spec-driven-development](https://github.com/) — Bitemporal versioning, MCP server, SFDT utilities
