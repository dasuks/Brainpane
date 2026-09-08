# Verification record

Validated on 2026-09-09. Claims below concern the terminal implementation, not the archived browser UI.

## 0.2 on-demand release checks

- Windows PowerShell profile integration installed and verified at the actual redirected Documents profile path. New shells resolve `codex`, `claude`, and `brainpane` as functions. Original CLI version commands still work. Existing CLI settings/login were not modified.
- Actual Codex 0.153.4 and Claude 2.1.263 were launched by the ordinary shell command in separate test workspaces, with no startup activation prompt. Two public conversation turns occurred while the map remained inactive at version 0, with no captured goal/history.
- Explicit `$brainpane start` / `/brainpane start` opened the panel and reconstructed the prior reading-group discussion, including its original goal and topic branches. Both tests then stopped through the skill, continued chatting with no state updates, and reopened with the original topic IDs preserved. Both ended at version 5 with five topics. These are live model smoke tests, not predetermined patches or a general quality guarantee.
- The first Codex automation attempt timed out after sending the second prompt. Increasing the test's paste/turn-settle intervals allowed the rerun to complete. We do not treat that as proof of universal input timing compatibility.
- 22 unit/integration tests passed locally, covering installer ownership, repeat installation, UTF-16 profile preservation, Unicode paths, existing functions, passthrough/recursion, interrupted-setup recovery, and session-bound panel lifecycle in addition to the prior map/VT tests.
- Terminal E2E and dormant → open → publish → hide → sync → stop → reopen E2E passed. A no-change synchronization can clear loading without a semantic patch. Default session directories contain a Git exclusion file.
- GitHub Actions defines Windows/Linux/macOS build, unit and deterministic PTY checks. Until the corresponding run passes, the definition alone is not a compatibility result. Live logged-in model tests remain opt-in and are not run in CI.

The earlier checks below document the immediate-open 0.1 path, which is still available through `brainpane run`.

## Environment

- Windows x64, Node.js 24.14.1, npm 11.12.1.
- node-pty 1.1.0 / Windows ConPTY; @xterm/headless 6.0.0; Unicode11 addon 0.9.0.
- Windows Terminal native window visually inspected: actual Codex on the left, the eight-turn demo map on the right, visible cursor and Korean hierarchy. This is separate from the live semantic CLI tests below.
- Actual installed Codex CLI 0.153.4 and Claude Code 2.1.263, with their existing logged-in sessions. No authentication file was read/extracted by Brainpane; no separate provider was configured.
- Rust/Ratatui candidates were researched but not used. Rust/C++ compilers were absent; Node's available native prebuild and the existing state engine enabled direct Windows validation.

## Completed checks

- PowerShell npm-launcher regression: both preserved and consumed `--` separators, wrapper/child option separation, and npm-style `.ps1` argument forwarding checked. The globally linked `brainpane run --no-bootstrap -- claude --version` also launched real Claude 2.1.263 inside the terminal and exited successfully. Current test total: 16 including these two regression tests.
- TypeScript build.
- Mouse-focus regression: the terminal E2E enables child mouse tracking, enters map focus, clicks the left pane, and verifies a Korean paste reaches the child. A subsequent map wheel event must preserve chat focus. The map-focus footer also explains how to return to typing.
- Claude startup was retested using its official `--append-system-prompt` option: no synthetic startup user message, version 0 before input, then four actual interactive turns published versions 1–4 with topic counts 1, 2, 3, 3 and a return to the original visibility topic. This replaces the old visible activation-message path for bare Claude launches.
- Codex was retested through the globally linked npm launcher in PowerShell (`node scripts/verify-real-cli.mjs codex --installed-launcher`). A short Korean activation message replaces the long internal instruction dump; existing Codex developer instructions are preserved. Actual map click → left click → Korean paste/submit succeeded; map wheel kept chat focus. Four real turns produced versions 1–4, topic counts 1, 2, 3, 3, and focus root → terminal-visibility → mapping-token-burden → terminal-visibility, with the deferred topic retained. Version stayed 0 until the first actual question.
- Clean installation from only tracked source files in a separate temporary directory: `npm ci`, `npm run build`, `npm test`, and `npm run test:e2e` all passed. No local skill installation or existing build output was copied.
- 14 unit/integration tests: reducer atomicity/schema, duplicates/stale revision, user protection, decision evidence, stable selection/layout, eight-turn fixture, storage restore/isolation/concurrency/stop, real publish command → saved state → event delivery, Host/Origin/access validation, installers refusing overwrites, VT clipping/alternate screen/CJK width, cursor query/paste mode, fragmented paste, terminal map selection/detail persistence, evidence-backed table rendering.
- Nested PTY terminal E2E: left streaming terminal-control fixture plus actual dynamic right map; child erase isolated to left; UTF-8 paste; mouse text selection and Windows clipboard content verified; scrollback/latest-output controls; all eight demo patches reaching the right panel; old-node selection separate from focus; detail view; 70-column toggle; resize/hide/show; forwarded Ctrl+C; alternate-screen/paste-mode restoration; internal runtime removed on exit.
- Actual Codex with a static isolation panel: normal interactive startup, Korean multiline paste remaining in the composer before submission, real Korean model response, streaming/resize and focus/panel controls.
- Actual Codex **four interactive semantic turns**: versions 1→4, topic counts 1→2→3→3; root → terminal-visibility → mapping-token-cost → terminal-visibility. Existing branch reused; deferred topic retained.
- Actual Claude **four interactive semantic turns**: versions 1→4, topic counts 1→2→3→3; root → visibility → token-cost → visibility. Existing branch reused; deferred topic retained. The first attempt stopped at Claude's normal project-trust screen; the subsequent explicit trusted-project test completed.

The actual CLI tests run the regular interactive processes inside the wrapper PTY, not `echo`, canned chat output, or an API replacement. Existing CLI startup/plugin warnings were confined to the left screen and did not prevent mapping.

## Scope and remaining limits

- Four live turns are a smoke test, not a general guarantee of semantic accuracy or per-turn invocation. The eight-turn replay remains deterministic; full manual evaluation is documented separately.
- Cross-platform implementation is present; Linux/macOS/WSL, cmux, and every external terminal host combination have not been verified. No host-specific API is required by the product.
- Complete Korean strings and multiline paste were checked. Every host's native IME composition/candidate UI and complex emoji/grapheme widths were not verified.
- The compositor handles standard VT cell attributes, normal/alternate buffers, cursor queries and resize. Images, all extended keyboard protocols, external OSC clipboard operations and every legacy mouse encoding are not claimed supported.
- Native UI trust/auth/tool approvals stay inside the original CLI. The wrapper does not bypass them.
- Normal exit, Ctrl+C child exit and wrapper quit restore terminal modes. Forced process termination or power loss cannot execute cleanup; use your terminal's reset if needed.
- A server-side stop rejects updates; the CLI must also receive stop to cease all extra agent work. Skills can be missed. Explicit sync uses current available conversation context and cannot recover unavailable hidden history.
- View state persists independently; the native AI CLI's history/session persistence remains its own responsibility.
