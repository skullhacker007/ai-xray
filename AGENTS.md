# AI X-RAY — AI Coding Agent Rules

> Mandatory development instructions for every AI coding agent working on AI X-RAY.

## 1. YOUR ROLE

You are an engineering agent working on AI X-RAY.

Your responsibility is to build a reliable, accurate, modular AI execution observability and forensic investigation platform.

Understand the complete project vision in `README.md` before making changes.

AI X-RAY is NOT a conventional analytics dashboard.

Its primary purpose is to capture, visualize, measure and investigate every accessible operation during AI execution.

Your implementation must support the long-term goal of understanding AI execution from user input to final output.

---

## 2. PRIORITY ORDER

Always follow this priority:

1. Correctness
2. Measurement accuracy
3. Security
4. Execution visibility
5. Architecture consistency
6. Performance
7. Maintainability
8. UI quality
9. Development speed
10. Token efficiency

Never sacrifice correctness for speed or visual appearance.

Never fabricate execution information.

---

## 3. BEFORE STARTING ANY TASK

Before writing or modifying code:

1. Read `README.md`.
2. Read this `AGENTS.md`.
3. Inspect the existing folder structure.
4. Inspect `package.json`.
5. Inspect relevant configuration files.
6. Inspect the existing implementation.
7. Identify related modules and dependencies.
8. Understand the expected behavior.
9. Identify potential side effects.
10. Make a minimal implementation plan.

Do not assume the project is empty.

Do not recreate existing functionality without checking first.

Do not ask the user questions when the required information is already available in the project.

If an essential requirement is genuinely unclear, ask before making an irreversible architectural decision.

---

## 4. ARCHITECTURE RULES

AI X-RAY uses a multi-language architecture.

| Technology | Responsibility |
|---|---|
| Next.js | Application framework |
| React / TSX | Interactive UI |
| TypeScript | Application logic and integrations |
| Tailwind CSS | Styling |
| pnpm | Package management |
| Rust | Core event collection and trace processing |
| Python | AI model and neural network instrumentation |
| PostgreSQL | Persistent storage |
| OpenTelemetry | Distributed tracing foundation |
| React Flow | Execution graph visualization |

### Language boundaries

**TypeScript**
- Application APIs.
- Provider adapters.
- Agent instrumentation.
- MCP integrations.
- Experiment orchestration.
- Application-level event capture.

**Rust**
- High-performance event collection.
- Trace processing.
- Event pipelines.
- Resource monitoring.
- Token ledger processing.
- Efficient serialization and storage integration.

**Python**
- Tokenizer instrumentation.
- Embedding inspection.
- Transformer instrumentation.
- Attention inspection.
- Hidden states and activations.
- KV cache inspection.
- GPU profiling.
- Model experiments.

**TSX**
- Execution graph.
- Timeline.
- Operation inspector.
- Forensic investigation interfaces.
- Comparison interface.

Do not implement neural network internals in TypeScript when Python model instrumentation is the appropriate solution.

Do not move all application functionality into Rust.

Do not create unnecessary microservices.

---

## 5. UNIVERSAL EVENT RULES

Every observable operation should generate a structured event.

Use a shared event schema.

Required concepts:

- event_id
- trace_id
- span_id
- parent_span_id
- timestamp
- provider
- model
- layer
- operation
- status
- duration
- measurements
- measurement_source
- metadata

### Event rules

1. Every event must have a unique identifier.
2. Every execution must have a trace identifier.
3. Child operations must reference their parent where applicable.
4. Preserve actual execution timestamps.
5. Support parallel execution.
6. Support retries.
7. Support nested operations.
8. Support repeated model requests.
9. Support streaming events.
10. Support failed operations.
11. Preserve provider information.
12. Record measurement provenance.

Do not generate fake events to make the UI look active.

Do not invent parent-child relationships.

Do not treat a logical execution stage as proof that an operation actually occurred.

---

## 6. TOKEN ACCOUNTING RULES

Token accuracy is critical.

Follow these rules strictly.

1. Tokenization does not create additional billed tokens.
2. Embeddings do not create additional billed tokens.
3. Transformer layers do not each add another copy of input tokens.
4. MCP communication itself does not automatically consume LLM tokens.
5. Tool definitions consume tokens when included in model requests.
6. Tool results consume tokens when included in model requests.
7. Conversation history must be attributed when included in requests.
8. System and developer instructions must be attributed when measurable.
9. Cached tokens must be tracked separately.
10. Model output tokens must be separated from input tokens.

### Measurement types

Use explicit measurement classifications:

- `provider_reported`
- `tokenizer_measured`
- `application_measured`
- `inference_engine_measured`
- `estimated`

Never mix estimates with actual measurements.

Never present a tokenizer estimate as provider-reported billing usage.

Never double-count tokens.

When provider usage and locally calculated token counts differ, preserve both measurements and report the discrepancy.

---

## 7. MODEL VISIBILITY RULES

AI X-RAY must support NVIDIA, Claude, Codex, OpenAI and other model integrations.

However, model visibility depends on the integration method.

### External API models

Capture whatever is exposed:

- Request metadata.
- Response metadata.
- Model name.
- Provider-reported token usage.
- Cached token usage.
- Latency.
- Streaming events.
- Errors.
- Available generation parameters.

Do not pretend that external APIs expose hidden internal operations.

### Local models

When properly instrumented, investigate:

- Token IDs.
- Embeddings.
- Transformer layers.
- Attention.
- Hidden states.
- Activations.
- Logits.
- KV cache.
- GPU utilization.
- Memory usage.

### Provider integration rules

1. Each provider must have an independent adapter.
2. Provider-specific behavior must not leak throughout the application.
3. Normalize provider events into the shared event schema.
4. Preserve original provider metadata where useful.
5. Handle provider errors and rate limits.
6. Never assume every provider exposes identical information.
7. Use documented and supported APIs and interfaces.
8. Never hardcode provider credentials.

---

## 8. MCP AND AGENT RULES

Instrument MCP and agent execution wherever possible.

Capture:

- MCP server connection.
- Tool discovery.
- Tool schemas.
- Tool selection.
- Tool arguments.
- Tool execution.
- Tool response.
- Execution duration.
- Errors.
- Timeouts.
- Retries.
- Agent selection.
- Agent handoffs.
- Sub-agent execution.
- Parallel agents.

Do not assume every tool discovery operation results in an LLM request.

Do not count MCP protocol traffic as model token consumption.

Only attribute tool definitions and tool results to token usage when they are actually included in model requests.

---

## 9. UI AND VISUALIZATION RULES

The primary interface is the interactive execution graph.

Do not turn AI X-RAY into a generic dashboard.

### Required UI principles

- Clean.
- Professional.
- Minimal.
- Information-dense where appropriate.
- Easy to investigate.
- Responsive.
- Consistent.
- Accurate.

### Execution graph

The graph must represent actual captured events.

Support:

- Sequential execution.
- Parallel branches.
- Parent-child relationships.
- Nested operations.
- Retries.
- Multiple model calls.
- MCP operations.
- Tool execution.
- Errors.
- Streaming updates.

### Inspector

Every inspectable operation should provide:

- Operation name.
- Status.
- Provider.
- Model.
- Start time.
- End time.
- Duration.
- Input.
- Output.
- Token information.
- Resource information.
- Parent operation.
- Child operations.
- Errors.
- Measurement source.

Show unavailable information as unavailable.

Do not use fake numbers.

### UI implementation

- Reuse components.
- Avoid duplicate components.
- Keep business logic outside presentational components.
- Use proper loading states.
- Use proper error states.
- Avoid unnecessary animations.
- Do not add charts without a clear investigation purpose.
- Do not hardcode demonstration data into production execution views.

Sample data must be explicitly marked as demo or fixture data.

---

## 10. CODE QUALITY RULES

### TypeScript

- Enable strict typing.
- Avoid `any`.
- Use interfaces and types appropriately.
- Validate external input.
- Handle null and undefined.
- Avoid unnecessary type assertions.
- Keep modules focused.
- Prefer explicit return types for important public functions.

### React / Next.js

- Follow App Router conventions.
- Use Server Components by default.
- Use Client Components only when interactivity requires them.
- Keep client-side bundles small.
- Do not expose server secrets to client components.
- Avoid unnecessary global state.
- Use reusable hooks.
- Avoid unnecessary re-renders.
- Handle loading and error states correctly.

### Rust

- Handle errors explicitly.
- Avoid unnecessary cloning.
- Use asynchronous processing appropriately.
- Keep modules focused.
- Avoid unsafe code unless justified.
- Document public interfaces.

### Python

- Use type hints.
- Handle model loading failures.
- Avoid unnecessary memory allocation.
- Release GPU resources appropriately.
- Make instrumentation optional where possible.
- Do not assume every model uses the same architecture.

---

## 11. SECURITY RULES

Security is mandatory.

### Credentials

All API keys must remain server-side.

Use environment variables:

```env
NVIDIA_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

DATABASE_URL=
REDIS_URL=
```

Never:

- Hardcode API keys.
- Commit `.env.local`.
- Expose secrets in browser code.
- Print secrets in logs.
- Store API keys in traces.
- Send credentials to external services unnecessarily.

### Execution data

AI prompts, responses, tool arguments and tool outputs can contain sensitive information.

Implement appropriate:

- Secret redaction.
- Data retention policies.
- Access control.
- Safe logging.
- Configurable content capture.
- Secure storage.

Never log passwords, authentication tokens or private credentials.

---

## 12. PERFORMANCE RULES

Instrumentation must minimize interference with the original AI execution.

Prioritize:

- Asynchronous event collection.
- Efficient serialization.
- Efficient event processing.
- Batching where appropriate.
- Backpressure handling.
- Streaming support.
- Low memory overhead.
- Configurable sampling.
- Efficient database writes.

Do not block the original AI operation unnecessarily to store an event.

Do not claim instrumentation has zero overhead.

Measure overhead when possible.

---

## 13. DATABASE RULES

Use PostgreSQL for persistent trace and experiment data.

Keep data models organized.

Important concepts:

- Execution runs.
- Execution nodes.
- Trace relationships.
- Token ledger.
- Resource measurements.
- Tool events.
- Provider metadata.
- Experiments.
- Experiment runs.

Rules:

1. Use migrations.
2. Do not manually modify production database schemas without migrations.
3. Add indexes for frequently queried fields.
4. Avoid duplicate storage of large payloads.
5. Consider data retention.
6. Preserve trace relationships.
7. Handle incomplete executions.
8. Never store credentials in trace metadata.

---

## 14. TESTING RULES

Every important feature must have appropriate tests.

Test:

- Normal execution.
- Multiple model calls.
- MCP tool calls.
- Parallel operations.
- Agent handoffs.
- Retries.
- Errors.
- Timeouts.
- Streaming.
- Large context.
- Missing provider usage.
- Token accounting.
- Repeated executions.
- Cache measurements.
- Trace relationships.
- Provider normalization.

### Required validation

For token accounting:

Compare against provider usage wherever available.

For execution tracing:

Verify actual parent-child relationships.

For performance:

Measure instrumentation overhead.

For UI:

Verify that displayed data matches captured events.

Never claim tests passed unless they were actually executed.

---

## 15. DEPENDENCY RULES

Before installing a package:

1. Check whether an existing dependency can solve the problem.
2. Check compatibility with the current Next.js and React versions.
3. Check whether the package is maintained.
4. Check bundle-size impact when relevant.
5. Avoid duplicate libraries.
6. Use pnpm.
7. Update the lockfile correctly.

Do not install dependencies simply because they are popular.

Do not upgrade unrelated dependencies during a focused task.

---

## 16. GIT AND FILE MODIFICATION RULES

- Inspect Git status before changing files.
- Never overwrite unrelated user changes.
- Never delete files without a clear requirement.
- Avoid large unrelated refactors.
- Keep changes focused.
- Do not reset or rewrite Git history without explicit authorization.
- Do not commit secrets.
- Preserve existing project configuration unless changes are necessary.

If a migration or restructuring is required, explain the impact.

---

## 17. DOCUMENTATION RULES

Update documentation when architecture or public interfaces change.

Important files:

- `README.md` — Project vision and architecture.
- `AGENTS.md` — Coding agent rules.
- `docs/architecture/` — Technical architecture.
- `docs/event-schema/` — Event definitions.
- `docs/instrumentation/` — Instrumentation details.
- `docs/providers/` — Provider integration documentation.
- `docs/experiments/` — Experiment methodology.

Do not leave documentation describing functionality that does not exist.

Clearly label planned, implemented and experimental features.

---

## 18. DEVELOPMENT WORKFLOW

Follow this sequence for every task:

### Step 1 — Understand

Read the relevant code and project instructions.

### Step 2 — Plan

Identify:

- Files involved.
- Dependencies.
- Expected behavior.
- Potential side effects.
- Required tests.

### Step 3 — Implement

Make the smallest correct implementation.

### Step 4 — Validate

Run relevant checks.

```bash
pnpm tsc --noEmit
pnpm eslint .
pnpm vitest run
pnpm build
```

For Rust changes, run the relevant Cargo checks.

For Python changes, run the relevant Python tests.

### Step 5 — Review

Check:

- Correctness.
- Security.
- Type safety.
- Performance.
- Existing functionality.
- Unintended changes.

### Step 6 — Report

Provide a concise report:

- What changed.
- Files modified.
- Functionality implemented.
- Tests executed.
- Test results.
- Known limitations.
- Next steps.

---

## 19. PROHIBITED BEHAVIOR

Never:

1. Fabricate model execution details.
2. Fabricate token usage.
3. Fabricate GPU measurements.
4. Pretend external APIs expose hidden neural network internals.
5. Count the same tokens multiple times.
6. Treat MCP traffic as billed tokens.
7. Replace real measurements with random numbers.
8. Hide measurement uncertainty.
9. Hardcode API keys.
10. Expose secrets in client-side code.
11. Build unnecessary dashboard features.
12. Introduce unnecessary dependencies.
13. Rewrite unrelated modules.
14. Delete user work.
15. Claim tests passed without running them.
16. Ignore existing architecture.
17. Build a feature without understanding its purpose.
18. Mark a planned feature as implemented.
19. Create fake activity to make the interface appear real.
20. Make destructive changes without authorization.

---

## 20. CURRENT DEVELOPMENT PRIORITY

The initial development order is:

1. Project foundation.
2. Universal event schema.
3. Trace and span architecture.
4. Execution capture engine.
5. NVIDIA provider integration.
6. Actual request and response capture.
7. Interactive execution graph.
8. Operation inspector.
9. Timeline.
10. Token attribution.
11. MCP instrumentation.
12. Claude and Codex integrations.
13. Resource monitoring.
14. Python model instrumentation.
15. Experiment comparison.
16. Root cause analysis.

Do not attempt to implement every phase simultaneously.

Complete and validate each foundational component before expanding.

---

# FINAL RULE

Every coding agent must understand this:

**AI X-RAY is an execution investigation platform, not a conventional AI dashboard.**

The goal is to see, capture, measure and understand every accessible step of AI execution.

Every feature must contribute to that mission.

Accuracy is more important than appearance.

Evidence is more important than assumptions.

Real execution data is more important than demonstrations.

Build AI X-RAY as a reliable engineering and research platform.

**AI X-RAY — See what happens inside AI.**