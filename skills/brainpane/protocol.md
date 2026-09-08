# Local command and patch protocol

Commands after `node "<skill-directory>/bridge.mjs"`:

```text
context --session ID
open
sync
hide
ready
begin --session ID --goal "Original question" --title "Short root topic" --cli codex --conversation "Explicit conversation label"
publish --session ID --file "absolute/path.json"
stop --session ID
resume --session ID
```

After `brainpane setup`, normal `codex`/`claude` commands start a dormant wrapper. It manages the internal service and exports BRAINPANE_SESSION, BRAINPANE_DATA_DIR and BRAINPANE_COMMAND to that exact child. `open` shows the bound terminal panel and activates mapping; `sync` shows progress but rejects stopped maps; `hide` hides without stopping; `stop` stops mapping and closes the panel; `resume` explicitly reopens. Existing topics and user corrections survive stop/start. `begin` is only a legacy standalone-service command, never needed inside a wrapper. Inside the child, omit `--session` and `--data` to use its inherited binding. Never launch another server/browser/terminal. Use `node "<BRAINPANE_COMMAND value>" ...` or the installed bridge. Runtime ports are ephemeral. The map ID is not a native CLI message/session ID.

Patch object: `updateId` (unique stable ID for retries), `baseVersion` (integer), `operations` (1–30). Unknown fields are rejected. IDs match `[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}`. Titles/goals: 1–140 characters. Summaries/progress/remaining/reason: max 1200 characters. Max 300 topics; max 128 KiB request. No coordinates, selection, viewport, delete, reparent or full-state replacement operations.

```json
{
  "updateId": "turn-2-f0e9",
  "baseVersion": 0,
  "operations": [
    {"type":"add","topic":{
      "id":"integration","parentId":"root","title":"CLI integration",
      "summary":"Considering how to connect the existing conversation.",
      "progress":"Options are being compared.","remaining":"How should updates be delivered?",
      "status":"open","sources":[],"statements":[]
    }},
    {"type":"focus","topicId":"integration","certainty":"inferred","reason":null}
  ]
}
```

- `add`: complete topic as above; parent must exist by the end of the transaction. Exactly one root is preserved.
- `edit`: `{"type":"edit","topicId":"integration","changes":{"summary":"...","status":"parked"}}`. Only title, summary, progress, remaining, status, sources, statements are editable. Omitted fields are retained; arrays replace the previous array, so preserve relevant old entries. IDs and parentage are immutable.
- `focus`: `topicId`, `certainty` (`confirmed` or `inferred`), `reason` (string or null). Moving focus does not change topic status.
- `goal`: `goal` and `evidence` (captured user source) for explicit goal changes; originalGoal and history remain preserved.

For wrapper-created sessions with `waitingForGoal: true`, the first `goal` operation initializes `originalGoal` and clears that flag. Ground it in the first actual user question, not the wrapper's startup instruction. Include an `edit` of root title/summary in the same update.

Optional topic `presentation` (on add or in edit changes): `null` clears it. A flow is `{"kind":"flow","certainty":"proposal","steps":[{"text":"First discussed step","sourceId":"quote-1"},{"text":"Next discussed step","sourceId":"quote-1"}]}`. There must be 2–8 steps, certainty is proposal or confirmed. A table is `{"kind":"table","columns":["Option","Discussed reason"],"rows":[{"cells":["Candidate A","User's actual reason"],"sourceId":"quote-1"}]}`. There must be 2–4 columns, 1–8 rows, and each row has exactly the column count. Every sourceId must reference a captured source in that topic. Text cells are at most 140 characters. These constraints validate references, not semantic certainty; do not invent comparisons, adoption, ordering or facts. Other topic text remains the canonical context. Details use these same fields.

Statuses: `open` (includes comparing/undecided), `resolved`, `parked`. Sources: `{ "id":"quote-local-1", "role":"user", "text":"Exact captured public utterance" }`; role may also be assistant. Max 20 per topic, each max 4000 characters. No URL or local-file fetch API. Routine context returns source IDs/roles without full quote text; preserve omitted arrays unless the quotes are available in your actual context.

Statements: `{ "kind":"proposal", "text":"Candidate option" }` or `{ "kind":"decision", "text":"Explicitly agreed choice", "sourceId":"quote-local-1" }`. A decision requires a user source present in the same topic. This validates provenance structure, not the meaning of agreement: you must judge that conservatively. Max 20 statements per topic. Empty arrays are valid.

Server responses: 401 access denied, 404 unknown map, 409 stale revision/protected field/stopped/ID reuse, 422 invalid schema/reference/evidence, 413 request too large. Any rejected transaction leaves the saved map unchanged. Same update ID + identical parsed JSON is idempotent; reusing an ID with different content conflicts. Receipt history supports 10,000 updates per map; at that limit create a new explicitly named map (no silent rollover).
