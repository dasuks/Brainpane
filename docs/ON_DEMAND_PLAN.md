# On-demand terminal map (0.2)

The ordinary `codex` / `claude` command starts the real CLI inside a dormant wrapper. No startup user prompt, no mapping inference, and no visible map. Explicit skill start opens the panel and maps the public context already available to the same agent. Stop hides the panel and rejects further patches; reopening preserves existing IDs and user edits.

Implementation order:
1. Authenticated, session-bound panel controls; inactive startup and in-place resize.
2. Common skill start/sync/stop with retrospective initialization and no transcript scraping.
3. Reversible user-scoped shell integration and skills, doctor/uninstall, noninteractive passthrough and recursion prevention.
4. Deterministic lifecycle/input tests, real late-start CLI checks, clean installation and documentation.

Boundaries: shell functions only affect shells that load the installed profile. Existing CLI binaries, login, CLI configuration and unrelated profile content remain owned by the user. An already-running unwrapped CLI cannot acquire this compositor. Available context can omit compacted history. No every-turn execution guarantee, extra model provider, or external web UI. Windows PowerShell is the first verified installation path; other platforms must be reported separately.

Release requires exact install/uninstall ownership checks, preserving profile edits made after installation, no collection before activation, no nested wrapper in CLI tools, and an integration test that starts with ordinary conversation before opening the map.
