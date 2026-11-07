# AI X-RAY
### AI Execution Observability, Neural Network Inspection & Forensic Analysis Platform

**Project:** AI X-RAY  
**Type:** AI Observability, Instrumentation, Execution Tracing and Research Platform  
**Status:** Initial Development  
**Architecture:** Multi-language, Modular Monorepo  
**Frontend:** Next.js, React, TypeScript, TSX  
**Package Manager:** pnpm

---

# 1. PROJECT VISION

AI X-RAY is a deep AI execution observability and forensic investigation platform.

Its purpose is to understand, capture, visualize and analyze what happens during an AI operation, from the moment a user submits an input until the final response is delivered.

We do not want another conventional AI dashboard.

We want a system that can investigate the actual execution process of AI systems.

Every observable operation should be represented as an interactive execution node, connected to other operations through a real execution graph.

Users should be able to follow an AI request step by step, inspect individual operations, understand resource consumption, investigate token usage, and identify why an operation happened.

The platform should work with multiple AI providers and model architectures.

### Main objective

Answer questions such as:

- What exactly happened when an AI request was submitted?
- Which components processed the input?
- Which agent handled the request?
- Which model was selected?
- How was the prompt constructed?
- Which MCP tools were discovered?
- Why was a particular tool selected?
- How many tokens were consumed?
- Which operations consumed the most time?
- What happened inside the model that we can actually observe?
- How many inference calls occurred?
- Why did the model call happen again?
- Was conversation history included?
- Was memory retrieved?
- Was a cache hit recorded?
- What happened between tool execution and the next model request?
- Why did two identical tasks consume different resources?
- What caused an error, retry or unexpected operation?
- How can the execution be optimized?

AI X-RAY should provide evidence rather than assumptions.

---

# 2. CORE PRINCIPLES

All development must follow these principles.

### 2.1 Accuracy First

Never invent execution events, token counts, cache hits, model operations or resource measurements.

Only show information that was actually measured, reported, captured or explicitly estimated.

### 2.2 Complete Execution Visibility

Capture every operation that is accessible through instrumentation.

Examples:

- User input
- Request construction
- Agent orchestration
- Prompt construction
- Context assembly
- Model requests
- MCP discovery
- Tool selection
- Tool execution
- Tool responses
- Tokenization
- Inference
- Output generation
- Memory retrieval
- Cache operations
- Retries
- Errors
- Final response delivery

### 2.3 Visual Investigation

The primary interface must be an interactive execution graph.

Do not build the application around traditional dashboard cards and charts.

The user must be able to click an operation and inspect its details.

### 2.4 Provider Independence

Do not tightly couple the system to NVIDIA or any single AI provider.

Use provider adapters and a common event format.

### 2.5 Measurement Transparency

Every measurement must identify its source.

Supported measurement classifications:

- `provider_reported`
- `tokenizer_measured`
- `application_measured`
- `inference_engine_measured`
- `hardware_measured`
- `estimated`

Never display estimated measurements as actual measurements.

### 2.6 Modular Architecture

Rust, Python and TypeScript have different responsibilities.

Do not unnecessarily move all functionality into one language.

### 2.7 No Premature Microservices

Start with modular components and clear interfaces.

Introduce separate services when required by performance, deployment or isolation needs.

---

# 3. WHAT AI X-RAY MUST INVESTIGATE

The platform should investigate the following execution layers.

## Layer 0 — User Input

Capture:

- User input
- Input format
- Input size
- Attachments
- Timestamp
- Session ID
- Request ID

## Layer 1 — Application Processing

Investigate:

- API request reception
- Authentication
- Validation
- Request transformation
- Middleware
- Application processing
- Error handling

## Layer 2 — Agent Orchestration

Investigate:

- Agent selection
- Agent initialization
- Agent instructions
- Agent handoffs
- Sub-agent creation
- Parallel agents
- Agent decisions when exposed by instrumentation
- Agent execution duration

## Layer 3 — MCP Discovery and Communication

Investigate:

- MCP server connections
- Available tools
- Tool schemas
- Tool descriptions
- Tool discovery
- Tool selection
- Protocol requests
- Protocol responses
- Tool execution requests
- Errors
- Retries
- Timeouts

MCP communication itself does not automatically consume LLM tokens.

However, MCP tool descriptions and results may consume tokens when included in an LLM request.

## Layer 4 — Tool Selection

Investigate:

- Available tools
- Selected tool
- Selection source
- Tool arguments
- Tool call reason, when exposed
- Selection latency
- Tool call sequence

## Layer 5 — Prompt Construction

Investigate:

- System instructions
- Developer instructions
- Agent instructions
- User input
- Conversation history
- Retrieved memory
- MCP tool definitions
- Tool results
- Additional context
- Final assembled prompt

The system should identify which components contributed to the model request.

## Layer 6 — Tokenization

Investigate:

- Tokenizer
- Input text
- Token IDs
- Token count
- Tokenization duration
- Special tokens
- Token boundaries

Use the correct tokenizer for the relevant model whenever available.

## Layer 7 — Embeddings and Neural Network

For accessible and instrumented models, investigate:

- Embedding operations
- Embedding dimensions
- Transformer layers
- Attention
- Multi-head attention
- MLP
- Hidden states
- Activations
- Tensor dimensions
- Intermediate outputs

Do not claim access to hidden model internals when using an external hosted API.

## Layer 8 — Inference and Token Generation

Investigate accessible information about:

- Inference requests
- Generation parameters
- Temperature
- Top-p
- Maximum output tokens
- Streaming
- Token generation
- Logits
- Sampling
- Stop conditions
- Inference duration

Logits and internal generation details require suitable model instrumentation.

## Layer 9 — Memory and Cache

Investigate:

- Conversation memory
- Context retrieval
- Memory lookup
- Cache lookup
- Cache hits
- Cache misses
- Prefix caching
- KV cache
- Cache storage
- Cache reuse

Differentiate application memory, provider prompt caching and inference-engine KV cache.

## Layer 10 — Tool Execution

Investigate:

- Tool execution start
- Tool execution end
- External API requests
- HTTP requests
- Response size
- Execution duration
- Network latency
- Errors
- Retries
- Parallel execution

## Layer 11 — Output Processing

Investigate:

- Model response
- Response parsing
- Output transformation
- Validation
- Final response formatting
- Response delivery

These are logical investigation layers. Actual execution may branch, repeat, overlap or skip layers.

---

# 4. MULTI-PROVIDER SUPPORT

AI X-RAY must support multiple providers.

Initial integration targets:

| Provider | Integration |
|---|---|
| NVIDIA | NVIDIA API / NIM |
| Anthropic | Claude API |
| OpenAI | OpenAI API |
| Codex | Supported Codex access interfaces |
| Hugging Face | Transformers |
| vLLM | Inference engine |
| llama.cpp | Local inference |
| Custom | Custom provider adapters |
| MCP | Model Context Protocol |

### Provider architecture

Each provider must have its own adapter.

Conceptually:

    AI X-RAY
        |
        v
    PROVIDER MANAGER
        |
        +---- NVIDIA Adapter
        |
        +---- Anthropic Adapter
        |
        +---- OpenAI Adapter
        |
        +---- Codex Adapter
        |
        +---- Custom Adapter
        |
        v
    UNIVERSAL EVENT FORMAT
        |
        v
    TRACE ENGINE

### Important provider limitations

External API providers may expose:

- Request metadata
- Response metadata
- Token usage
- Cached token usage
- Latency
- Model name
- Errors
- Streaming events

Availability depends on the provider and API.

Do not assume an external API exposes:

- Token IDs
- Embeddings
- Hidden states
- Attention matrices
- Activations
- Logits
- KV cache internals

These require local model access, suitable instrumentation or explicit provider support.

Codex and Claude may be accessed through different interfaces, including APIs, SDKs or CLI tools. Build integrations around documented and supported interfaces. Do not assume all interfaces expose identical information.

---

# 5. MAIN USER INTERFACE

The interface is an engineering investigation environment.

The most important component is:

## Interactive Execution Explorer

Every AI execution must have a visual representation.

Example:

    USER INPUT
        |
        v
    APPLICATION PROCESSING
        |
        v
    AGENT ORCHESTRATION
        |
        v
    PROMPT CONSTRUCTION
        |
        +--------------------+
        |                    |
        v                    v
    MCP DISCOVERY        MEMORY RETRIEVAL
        |                    |
        +---------+----------+
                  |
                  v
              TOKENIZER
                  |
                  v
              EMBEDDINGS
                  |
                  v
           TRANSFORMER MODEL
                  |
                  v
            TOKEN GENERATION
                  |
            +-----+------+
            |            |
            v            v
         TOOL CALL    TEXT OUTPUT
            |
            v
        MCP SERVER
            |
            v
        TOOL EXECUTION
            |
            v
        TOOL RESPONSE
            |
            v
       CONTEXT UPDATE
            |
            v
       NEXT MODEL CALL
            |
            v
        FINAL OUTPUT

This is only an illustrative execution.

The real graph must be generated from captured events.

### UI requirements

1. Interactive execution graph.
2. Real-time execution updates.
3. Expandable and collapsible operation nodes.
4. Parent-child relationships.
5. Parallel execution branches.
6. Repeated model calls.
7. Tool execution visualization.
8. Execution timeline.
9. Operation inspection panel.
10. Token consumption information.
11. Resource consumption information.
12. Error and retry visualization.
13. Execution comparison.
14. Trace navigation.

### Operation Inspector

When a user clicks a node, display:

- Operation name
- Operation type
- Provider
- Model
- Status
- Start time
- End time
- Duration
- Parent operation
- Child operations
- Input
- Output
- Token measurements
- Resource measurements
- Errors
- Measurement source

Information should be displayed only when available.

### Timeline

The timeline must show actual operation start and end times.

It must support:

- Sequential operations
- Parallel operations
- Nested operations
- Retries
- Repeated model requests
- Tool execution

### Execution Comparison

Users must be able to compare multiple executions.

Example:

- Test 1
- Test 2
- Test 3
- Test N

Compare:

- Input tokens
- Output tokens
- Cached tokens
- Total reported usage
- Number of model calls
- Number of tool calls
- Latency
- Resource consumption
- Errors
- Execution graph differences

Identify which operations caused differences.

---

# 6. TOKEN ACCOUNTING ENGINE

Token attribution is a major component.

The system must identify where tokens enter a model request.

Possible categories:

- System instructions
- Developer instructions
- Agent instructions
- User input
- Conversation history
- MCP tool definitions
- Retrieved memory
- Tool results
- Additional context
- Model output

### Critical accounting rules

1. Tokenization does not create additional billed tokens.
2. Embeddings do not create additional billed tokens.
3. Transformer layers do not each add another copy of the input tokens.
4. MCP communication does not automatically consume LLM tokens.
5. Tool definitions consume model tokens when included in model requests.
6. Tool results consume model tokens when included in model requests.
7. Provider-reported usage is authoritative for provider billing when available.
8. Tokenizer measurements and estimates must be clearly differentiated.
9. Cached tokens must be distinguished from uncached tokens.
10. Do not add per-layer processing counts to billed token totals.

### Example

A model request may contain:

| Category | Tokens |
|---|---:|
| System instructions | 1,000 |
| Agent instructions | 500 |
| MCP definitions | 2,000 |
| Conversation history | 500 |
| User input | 20 |
| Tool results | 2,000 |
| Total input | 6,020 |

Output:

| Category | Tokens |
|---|---:|
| Generated output | 500 |

These are illustrative values.

The actual request usage must come from the provider or appropriate tokenizer measurement.

---

# 7. RESOURCE MEASUREMENT ENGINE

Measure resources wherever instrumentation permits.

### System resources

- CPU utilization
- RAM consumption
- Process memory
- Disk activity
- Network traffic
- Request latency

### GPU resources

For accessible local inference:

- GPU utilization
- VRAM usage
- GPU memory allocation
- GPU execution time
- Tensor operations where available
- Batch information

Do not claim that application-level monitoring can directly measure the internal resource usage of a remote provider's infrastructure.

---

# 8. EXPERIMENT ENGINE

A major objective is understanding why repeated executions differ.

The experiment engine should support controlled experiments.

### Example experiment

Run the same task multiple times.

Test conditions:

| Test | Condition |
|---|---|
| T1 | First execution |
| T2 | Same task, same session |
| T3 | Same task, new session |
| T4 | Warm cache |
| T5 | Different MCP tool count |
| T6 | Different context size |

Measure:

- Input tokens
- Output tokens
- Cached tokens
- Model calls
- Tool calls
- Latency
- CPU
- Memory
- GPU
- Errors
- Cost, when provider pricing and usage are available

### Root cause analysis

The system should explain differences using captured evidence.

Example:

"Test 2 used 1,200 fewer input tokens because the previous execution reused a smaller conversation context."

This explanation must be supported by actual trace evidence.

If the cause cannot be established, say that it is unknown.

---

# 9. TECHNICAL STACK

Use the following architecture.

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js | Application framework |
| UI | React + TSX | Interactive components |
| Language | TypeScript | Application logic |
| Styling | Tailwind CSS | UI styling |
| Package manager | pnpm | Dependencies and workspace |
| Flow visualization | React Flow | Execution graph |
| Core engine | Rust | Event collection and trace processing |
| AI instrumentation | Python | Model internals and experiments |
| Database | PostgreSQL | Trace and experiment storage |
| Cache infrastructure | Redis, when needed | Application-side caching |
| Tracing | OpenTelemetry | Distributed tracing |
| Communication | gRPC / Protocol Buffers, where appropriate | Engine communication |
| Model research | PyTorch | Neural network inspection |
| Model access | Hugging Face Transformers | Local model instrumentation |
| Inference | vLLM / llama.cpp | Local inference instrumentation |

Use current stable and mutually compatible package versions.

Do not install dependencies without understanding their purpose.

---

# 10. PROJECT STRUCTURE

The project uses a pnpm-based monorepo.

```text
ai-xray/
│
├── src/
│   ├── app/
│   │   ├── (workspace)/
│   │   │   ├── executions/
│   │   │   ├── experiments/
│   │   │   └── providers/
│   │   │
│   │   └── api/
│   │       ├── health/
│   │       ├── traces/
│   │       ├── executions/
│   │       └── experiments/
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── flow/
│   │   │   ├── nodes/
│   │   │   └── edges/
│   │   ├── timeline/
│   │   ├── inspector/
│   │   ├── token-forensics/
│   │   ├── resource-forensics/
│   │   ├── comparison/
│   │   └── ui/
│   │
│   ├── hooks/
│   ├── stores/
│   ├── lib/
│   ├── server/
│   └── types/
│
├── integrations/
│   ├── providers/
│   │   ├── nvidia/
│   │   ├── anthropic/
│   │   ├── openai/
│   │   └── custom/
│   │
│   ├── mcp/
│   │   ├── client/
│   │   └── server/
│   │
│   ├── agents/
│   └── inference/
│
├── engines/
│   ├── rust-core/
│   │   ├── src/
│   │   └── tests/
│   │
│   └── python-ai/
│       ├── xray/
│       │   ├── tokenizers/
│       │   ├── embeddings/
│       │   ├── transformer/
│       │   ├── attention/
│       │   ├── activations/
│       │   ├── kv_cache/
│       │   ├── gpu_profiler/
│       │   └── experiments/
│       │
│       └── tests/
│
├── packages/
│   ├── event-schema/
│   └── trace-contracts/
│
├── protocols/
│   ├── protobuf/
│   └── json-schema/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── infrastructure/
│   ├── docker/
│   ├── observability/
│   └── scripts/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── docs/
│   ├── architecture/
│   ├── event-schema/
│   ├── instrumentation/
│   ├── providers/
│   └── experiments/
│
├── public/
├── .env.local
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

The actual project may evolve as implementation progresses. Keep the architecture modular and avoid unnecessary folders or empty abstractions.

---

# 11. UNIVERSAL EVENT SCHEMA

All engines and integrations must communicate using a common event structure.

Illustrative event:

```json
{
  "event_id": "event_001",
  "trace_id": "trace_001",
  "span_id": "span_001",
  "parent_span_id": null,
  "timestamp": "2026-01-01T10:00:00Z",
  "provider": "nvidia",
  "model": "selected-model",
  "layer": "tokenization",
  "operation": "encode_prompt",
  "status": "completed",
  "duration_ms": 12,
  "measurements": {
    "input_tokens": null,
    "output_tokens": 1250,
    "measurement_type": "tokenizer_measured"
  },
  "metadata": {}
}
```

This is an example, not the finalized schema.

### Required concepts

- Trace ID
- Event ID
- Span ID
- Parent span ID
- Timestamp
- Provider
- Model
- Layer
- Operation
- Status
- Duration
- Measurements
- Measurement source
- Metadata

Support:

- Sequential operations
- Parent-child relationships
- Parallel operations
- Retries
- Nested executions
- Multiple model calls
- Streaming events
- Errors

Define the final schema in `packages/event-schema` before implementing multiple independent event producers.

---

# 12. DATABASE DESIGN

Initial entities:

### execution_runs

Stores execution information.

- run_id
- task_id
- session_id
- provider
- model_id
- started_at
- completed_at
- status

### execution_nodes

Stores individual operations.

- node_id
- run_id
- parent_node_id
- operation
- layer
- status
- started_at
- completed_at
- duration

### token_ledger

Stores token attribution.

- id
- run_id
- node_id
- category
- input_tokens
- output_tokens
- cached_tokens
- measurement_type
- source

### resource_measurements

Stores resource metrics.

- id
- run_id
- node_id
- resource_type
- value
- unit
- measurement_source
- timestamp

### tool_events

Stores MCP and external tool execution.

- id
- run_id
- server_name
- tool_name
- execution_time
- response_size
- status

### experiments

Stores experiment configurations.

- experiment_id
- name
- description
- configuration
- created_at

### experiment_runs

Connects experiments to execution runs.

- id
- experiment_id
- run_id
- test_number
- condition

The database schema should evolve based on actual requirements. Do not create unnecessary tables before the event model is established.

---

# 13. DEVELOPMENT ROADMAP

Build the project in stages.

## Phase 1 — Foundation

Priority: Highest.

- Initialize the monorepo.
- Configure Next.js and pnpm.
- Define universal event schema.
- Define trace and span relationships.
- Establish project-wide TypeScript types.
- Establish Rust and Python package boundaries.
- Define measurement provenance.
- Establish test infrastructure.

Deliverable: A documented and validated architecture.

## Phase 2 — Execution Capture Engine

- Capture application events.
- Capture agent operations.
- Capture model requests and responses.
- Capture MCP operations.
- Generate trace IDs.
- Track parent-child relationships.
- Support retries and parallel operations.

Deliverable: A working execution trace.

## Phase 3 — Visual Execution Explorer

- Build interactive graph.
- Implement operation nodes.
- Implement connections.
- Implement timeline.
- Implement operation inspector.
- Support live updates.
- Display actual execution data.

Deliverable: A working visual investigation interface.

## Phase 4 — Provider Integrations

- NVIDIA integration.
- Claude integration.
- OpenAI integration.
- Codex integration.
- Custom provider adapter.
- Normalize provider metadata.
- Capture usage and latency.

Deliverable: Multi-provider execution tracing.

## Phase 5 — MCP and Agent Inspection

- MCP discovery instrumentation.
- Tool schema inspection.
- Tool call tracking.
- Tool execution tracking.
- Agent handoffs.
- Sub-agent tracing.
- Parallel execution.

Deliverable: Agent and MCP forensic inspection.

## Phase 6 — Token Attribution

- Tokenizer integration.
- Prompt component attribution.
- Provider usage collection.
- Cached token tracking.
- Token ledger.
- Accounting validation.

Deliverable: Accurate token consumption analysis.

## Phase 7 — Neural Network Inspection

- PyTorch instrumentation.
- Transformer inspection.
- Attention inspection.
- Hidden state inspection.
- Activation inspection.
- KV cache instrumentation.
- GPU profiling.

Deliverable: Deep inspection of accessible local models.

## Phase 8 — Experiment Engine

- Repeat execution.
- Compare executions.
- Control experiment conditions.
- Identify differences.
- Analyze token consumption.
- Analyze latency.
- Identify root causes.

Deliverable: Execution comparison and forensic analysis.

## Phase 9 — Optimization and Research

- Detect repeated operations.
- Identify unnecessary context.
- Detect inefficient tool usage.
- Identify expensive operations.
- Recommend optimizations.
- Validate improvements through experiments.

Deliverable: Evidence-based optimization recommendations.

---

# 14. DEVELOPMENT RULES FOR AI CODING AGENTS

All coding agents must follow these instructions.

### Before changing code

1. Read this README.
2. Inspect the existing project structure.
3. Read `package.json`.
4. Read relevant configuration files.
5. Understand existing implementations.
6. Identify the correct module for the requested change.
7. Check whether an equivalent implementation already exists.

### While implementing

1. Make minimal, focused changes.
2. Respect the existing architecture.
3. Use TypeScript strict typing.
4. Avoid unnecessary dependencies.
5. Avoid duplicated logic.
6. Keep provider integrations independent.
7. Use shared event contracts.
8. Handle errors properly.
9. Add tests for important functionality.
10. Never expose API credentials in frontend code.
11. Never fabricate measurements.
12. Do not implement fake model internals.
13. Do not use hardcoded sample data as actual execution results.
14. Keep UI components reusable.
15. Do not silently modify unrelated modules.

### After implementing

Run appropriate checks:

```bash
pnpm tsc --noEmit
pnpm eslint .
pnpm vitest run
pnpm build
```

Run Rust and Python tests when their modules change.

Report:

- Files changed.
- Features implemented.
- Tests executed.
- Test results.
- Known limitations.
- Remaining work.

Do not claim tests passed unless they were actually executed.

---

# 15. SECURITY REQUIREMENTS

AI X-RAY will handle API credentials and potentially sensitive AI prompts.

Security is mandatory.

### API keys

Store credentials in environment variables.

Example:

```env
NVIDIA_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

DATABASE_URL=
REDIS_URL=
```

Never:

- Hardcode API keys.
- Expose secrets in browser code.
- Commit `.env.local`.
- Print API keys in logs.
- Store credentials in execution traces.

### Sensitive execution data

Prompts, model outputs, tool arguments and tool results may contain sensitive information.

Implement:

- Secret redaction.
- Configurable data retention.
- Access controls.
- Secure credential handling.
- Safe logging.
- Optional content capture policies.

The user must be able to configure what content is captured and retained.

---

# 16. PERFORMANCE REQUIREMENTS

Instrumentation should not significantly disrupt the original AI execution.

Priorities:

- Low instrumentation overhead.
- Asynchronous event collection where appropriate.
- Efficient event serialization.
- Efficient trace storage.
- Streaming support.
- Backpressure handling.
- Batching where appropriate.
- Configurable sampling.
- Minimal additional network traffic.

The original AI operation should remain as unaffected as reasonably possible.

Measure instrumentation overhead instead of assuming it is negligible.

---

# 17. TESTING AND VALIDATION

Test the correctness of the measurement system.

Important scenarios:

1. Normal AI request.
2. Multiple model calls.
3. Tool call.
4. Multiple tool calls.
5. Parallel tool calls.
6. Agent handoff.
7. Nested agent execution.
8. Failed model request.
9. Tool timeout.
10. Retry.
11. Streaming response.
12. Empty response.
13. Large context.
14. Cached request.
15. Repeated execution.
16. New session.
17. Missing provider usage metadata.
18. Local model instrumentation.
19. External API with limited visibility.

Token accounting must be validated against provider usage wherever possible.

Trace graphs must preserve actual parent-child relationships and execution ordering.

---

# 18. WHAT WE ARE NOT BUILDING

AI X-RAY is not primarily:

- A chatbot.
- An AI agent builder.
- A stock market dashboard.
- A generic analytics dashboard.
- A simple API monitoring panel.
- A model leaderboard.
- A conventional log viewer.

Those features may be useful later, but they are not the project's central purpose.

The central purpose is:

**Understand, visualize, measure and investigate AI execution at every accessible layer.**

---

# 19. FIRST DEVELOPMENT PRIORITIES

Do not attempt to implement everything simultaneously.

The first engineering priorities are:

1. Establish the project architecture.
2. Finalize the universal event schema.
3. Define execution graph and trace relationships.
4. Build the execution capture mechanism.
5. Implement one provider integration (NVIDIA first).
6. Capture an actual model request and response.
7. Display the captured execution as an interactive flowchart.
8. Add operation inspection.
9. Add token and latency measurements.
10. Expand to Claude, Codex and other integrations.

Use actual executions as the foundation for the UI.

Do not build a large interface around invented data.

---

# 20. DEFINITION OF SUCCESS

AI X-RAY succeeds when a developer can submit an AI task and investigate the execution from beginning to end.

They should be able to see:

- What happened.
- When it happened.
- Which component performed it.
- What information entered the operation.
- What information came out.
- Which operation caused the next operation.
- How much time it consumed.
- How many tokens were used, where measurable.
- Which resources were consumed, where measurable.
- Whether the operation repeated.
- Whether caching occurred.
- Why two executions differed, when evidence establishes the cause.

The platform should make complex AI execution understandable through a precise, interactive visual representation.

---

# FINAL INSTRUCTION TO ALL AI CODING AGENTS

You are contributing to AI X-RAY.

Understand the project's overall purpose before implementing individual features.

Do not treat this project as a conventional dashboard.

Build an accurate, modular, provider-independent AI execution observability and forensic investigation platform.

Prioritize:

1. Correctness.
2. Measurement accuracy.
3. Complete observable execution tracing.
4. Security.
5. Performance.
6. Maintainability.
7. Clear visual investigation.
8. Efficient implementation.

Never sacrifice measurement accuracy for visual appearance.

Never pretend to observe inaccessible model internals.

Never fabricate execution data.

Every feature must contribute to understanding, measuring, visualizing or investigating actual AI execution.

**AI X-RAY — See what happens inside AI.**