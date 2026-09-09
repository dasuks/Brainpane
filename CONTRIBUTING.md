# Contributing

For the 0.2 lifecycle run `npm run build`, `npm test`, `npm run test:e2e`, and `npm run test:lifecycle`. The CI matrix covers Windows/Linux/macOS deterministic checks. `scripts/verify-on-demand.mjs` is an opt-in test with real CLI usage: converse before activation, invoke the skill, stop, and reopen. Never treat deterministic fixtures as evidence of LLM semantic quality.

Installer changes must preserve existing profiles, aliases, functions and edited skills. Add regressions for ownership/rollback and argument forwarding. Keep integration instructions in `docs/INSTALL.md` executable by a person or agent installing from the GitHub link. Do not add API credentials, auto-updaters or transcript scraping to the default path.

Install with `npm ci`, build with `npm run build`, then run `npm test` and `npm run test:e2e`. The terminal E2E uses a deterministic VT fixture, not a paid model.

For a CLI adapter or terminal change, also perform an opt-in actual CLI check (`npm run test:codex` / `npm run test:claude`). Those use the CLI's existing account usage. Report the OS, host, Node/CLI versions, exact reproduction and what was/was not verified.

Keep the main experience in one terminal. Reuse the terminal engine rather than parsing arbitrary ANSI into conversation semantics. Keep semantic data and selection/view state separate. Preserve original goals, topic IDs and user corrections. Do not turn proposals into decisions or every message into a node.

Do not commit `.brainpane/`, runtime keys, private conversations, account screenshots or CLI logs. Use synthetic fixtures for reproducible reports. Documentation and licenses must match actual behavior; no claims of guaranteed per-turn skill execution or universal terminal compatibility.

Architecture is enforced, not remembered. `docs/ARCHITECTURE.md` defines the layers (`core` ← `server` ← `terminal`, `web` legacy, `src/*.ts` entry points) and `npm run lint:arch` fails CI on any import against that direction or on Node built-ins inside `src/core/model.ts`. `npm run lint` runs oxlint's correctness rules with type-aware promise checks; it is a blocking step too. Change the rule and the document together when a new dependency is genuinely needed. Behaviour contracts (terminal mode restore, focus and mouse routing, patch rejection rules) are protected by tests: when you change such a contract, add or update the deterministic check in the same change.
