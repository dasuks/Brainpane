# Changelog

## 0.2.0 — on-demand terminal map

- User-scoped PowerShell/bash/zsh setup connects ordinary `codex` and `claude` commands to a dormant terminal wrapper.
- Explicit skill start opens the panel and maps the available prior conversation. Hide, sync, stop and reopen preserve semantic state and user edits.
- No startup model turn or map capture in the dormant path. User-only skill invocation policies, noninteractive passthrough and nested-wrapper prevention.
- Ownership-based upgrades/uninstall, profile encoding preservation, interrupted-install recovery and diagnosis.
- GitHub-link installation guide, deterministic lifecycle tests, real late-start tests for both CLIs, and a Windows/Linux/macOS CI matrix.
- Host terminal modes (mouse reporting, bracketed paste) are re-asserted on resize and focus-in, so hosts that re-attach or replay the screen keep reporting wheel events to the wrapped CLI instead of converting them to arrow keys. Focus reports reach the child only when it requested them.

Preview limits: no universal terminal/IME guarantee, no forced every-turn hook, no recovery of unavailable compacted conversation, and no injection into an already-running unwrapped CLI. npm-registry/native application releases are not provided.

## 0.1.0 — initial terminal MVP

Actual CLI PTY + xterm compositor, live topic map, partial validated updates, local persistence, explicit current-agent skills, demo and Windows CLI smoke tests. Later fixes covered PowerShell argument forwarding, mouse focus recovery and startup-message visibility.
