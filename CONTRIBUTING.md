# Contributing

Install with `npm ci`, build with `npm run build`, then run `npm test` and `npm run test:e2e`. The terminal E2E uses a deterministic VT fixture, not a paid model.

For a CLI adapter or terminal change, also perform an opt-in actual CLI check (`npm run test:codex` / `npm run test:claude`). Those use the CLI's existing account usage. Report the OS, host, Node/CLI versions, exact reproduction and what was/was not verified.

Keep the main experience in one terminal. Reuse the terminal engine rather than parsing arbitrary ANSI into conversation semantics. Keep semantic data and selection/view state separate. Preserve original goals, topic IDs and user corrections. Do not turn proposals into decisions or every message into a node.

Do not commit `.brainpane/`, runtime keys, private conversations, account screenshots or CLI logs. Use synthetic fixtures for reproducible reports. Documentation and licenses must match actual behavior; no claims of guaranteed per-turn skill execution or universal terminal compatibility.
