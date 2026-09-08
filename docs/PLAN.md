# MVP implementation boundary

## Superseding terminal requirement

The user replaced the web-first display contract: one `brainpane run -- codex|claude` command, the actual CLI on the left and a fixed map on the right in the same terminal. The sections below this amendment record the earlier plan, not the current product contract.

Rust/Ratatui/portable-pty/tui-term documentation was reviewed. No Rust/C++ toolchain was installed on this Windows environment. We retained the tested TypeScript state engine and chose node-pty 1.1.0 (ConPTY) plus @xterm/headless 6.0.0 (screen interpretation), validating actual Codex first. A bounded cell compositor renders the parsed screen, not raw child ANSI. The internal loopback service is owned by run, serves no web UI, and exits with it. Map data never comes from terminal screen parsing.

Vertical validation: real Codex screen + labeled static panel; Korean multiline paste, actual model response and resize; then authenticated publish to dynamic terminal panel; then live Codex and Claude skill-driven branch/revisit tests. Default UI/build/docs are terminal-first. Archived web sources remain isolated from the run entrypoint.

Empty repository inspected on 2026-09-09. Windows, Node 24.14.1, Codex CLI 0.153.4, Claude Code 2.1.263 present.

1. Validate topic-level incremental changes with Zod; reject stale revisions, duplicate ID reuse, broken references, cycles and ungrounded decisions atomically.
2. One loopback HTTP server owns atomic JSON snapshots. Authenticated local CLI publish → store → SSE → React Flow.
3. Persist browser-only selection, positions, collapse and viewport independently. Add nodes without moving existing nodes. Explicit follow/rearrange controls.
4. Replay eight synthetic turns through the same HTTP API. Keep replay separate from agent interpretation evaluation.
5. Install a shared Agent Skill plus portable Node launcher into project-scoped Claude/Codex directories without overwrites. Explicit map ID and CLI conversation label; no log discovery.
6. Unit, HTTP, browser and real current-agent checks; document verified and unverified environments.

Assumptions: one server per data directory; trusted OS account; small maps (up to 300 topics), one browser's view stored per origin/session. No transcript scraping, host webview assumptions, terminal wrappers, provider API, hook loop or automatic per-turn guarantee. User explicitly starts/stops mapping. Existing CLI handles its own model authentication and reasoning.
