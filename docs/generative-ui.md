# Generative UI

Son of Anton ships a "Tier 1" generative-UI pattern — a vanilla-JS analogue
to CopilotKit's `useCopilotAction({ render })` — that lets the LLM emit
structured, interactive blocks the chat surface renders inline alongside
its prose. No React, no extra dependencies.

The LLM calls a single builtin tool, `emit_ui_block`, just like any other
tool. The chat surface intercepts the tool result, posts a `uiBlock`
message to the webview, and mounts the corresponding renderer inline in
the assistant's body (or in a subtask card if the block was emitted from
a specialist's run).

## Architecture

```
LLM ──tool_use── emit_ui_block(component, props)
                       │
                       ▼
             tools/builtin.ts execute
                       │
                       ▼   metadata.kind === 'ui-block'
             ChatPanel intercepts result
                       │
                       ▼
           webview postMessage 'uiBlock'
                       │
                       ▼
   GENERATIVE_UI_RENDERERS[component](props, helpers)
                       │
                       ▼
                HTMLElement → DOM
```

* `son-of-anton-core/src/tools/builtin.ts` — defines the `emit_ui_block`
  tool. Its `execute` returns `{ metadata: { kind: 'ui-block',
  component, props, blockId } }`. The `blockId` is generated host-side.
* `extensions/son-of-anton/src/chat/ChatPanel.ts` — detects the
  `ui-block` metadata, deduplicates by `blockId`, and posts the block to
  the webview. Persists a `<<<sota:uiblock data="...">>>` sentinel for
  reload.
* `extensions/son-of-anton/media/chat-webview.js` — declares the
  `GENERATIVE_UI_RENDERERS` map, mounts blocks via `mountUiBlock`, and
  re-mounts persisted blocks via `hydrateUiBlockPlaceholders`.

## Helpers exposed to renderers

A renderer is `(props, helpers) => HTMLElement`. The `helpers` bag
carries:

* `helpers.blockId` — stable id minted host-side. Use it as a selector
  prefix or for ARIA labelling if you need a unique id on a child node.
* `helpers.respond(value)` — for `form` and `confirm`. Posts a
  `uiBlockResponse` to the host, which forwards the value back to the
  agent as a synthetic user turn (human-in-the-loop pattern).
* `helpers.onAction(name, payload)` — for `card` action buttons. Posts a
  `uiBlockAction` to the host. Use when you want the agent to react to a
  named click but don't want to freeze the block as "responded".

Renderers MUST escape any user/LLM-supplied string before injecting into
HTML. The webview exposes `escapeHtml(text)` for plain text and
`renderMarkdown(text)` for markdown bodies (markdown is escaped before
the recognised tags are re-introduced).

## The six built-in components

### `card`

Title + body (markdown) + optional action button row.

```javascript
emit_ui_block({
  component: 'card',
  props: {
    title: 'Migration plan',
    body: '**Step 1:** rename columns.\n**Step 2:** backfill.\n',
    actions: [
      { name: 'open_pr', label: 'Open PR', variant: 'primary' },
      { name: 'cancel',  label: 'Not yet', variant: 'secondary' },
    ],
  },
});
```

### `confirm`

Yes/No card. Calls `helpers.respond(true|false)`.

```javascript
emit_ui_block({
  component: 'confirm',
  props: {
    title: 'Run database migration?',
    body: 'This will alter the `users` table.',
    yesLabel: 'Run it',
    noLabel: 'Hold off',
  },
});
```

### `form`

Labelled fields with a Submit button. Calls `helpers.respond(values)`
where `values` is `Record<string, string | boolean>`.

```javascript
emit_ui_block({
  component: 'form',
  props: {
    title: 'New deployment',
    submitLabel: 'Deploy',
    fields: [
      { name: 'service', label: 'Service',     type: 'text',     required: true },
      { name: 'env',     label: 'Environment', type: 'select',   options: ['dev', 'staging', 'prod'] },
      { name: 'notes',   label: 'Notes',       type: 'textarea', placeholder: 'Optional context' },
      { name: 'force',   label: 'Force redeploy', type: 'checkbox' },
    ],
  },
});
```

### `table`

Rows × columns from JSON.

```javascript
emit_ui_block({
  component: 'table',
  props: {
    caption: 'Top error sources',
    columns: ['file', 'count', 'last_seen'],
    rows: [
      { file: 'auth.ts', count: 14, last_seen: '2 min ago' },
      { file: 'db.ts',   count: 9,  last_seen: '5 min ago' },
    ],
  },
});
```

### `chart`

A small SVG bar chart. v1 supports `type: 'bar'` only.

```javascript
emit_ui_block({
  component: 'chart',
  props: {
    type: 'bar',
    title: 'Requests per minute',
    labels: ['09:00', '09:01', '09:02', '09:03'],
    values: [42, 56, 71, 38],
  },
});
```

### `progress`

Multi-step progress bar. `current` is the zero-based index of the
in-progress step (`-1` means "not started", a value `>= steps.length`
means "all done").

```javascript
emit_ui_block({
  component: 'progress',
  props: {
    steps: ['Lint', 'Test', 'Build', 'Deploy'],
    current: 2,
  },
});
```

## Adding a new renderer

1. Pick a component name. Add it to `UI_BLOCK_COMPONENTS` in
   `son-of-anton-core/src/tools/builtin.ts`.
2. Register a renderer in `extensions/son-of-anton/media/chat-webview.js`
   using DOM APIs (createElement / textContent) rather than string
   concatenation. For example:

   ```javascript
   GENERATIVE_UI_RENDERERS.myThing = function (props, helpers) {
     const root = document.createElement('div');
     root.className = 'ui-block ui-block-mything';
     const title = document.createElement('div');
     title.className = 'ui-block-card-title';
     title.textContent = props.title || '';
     root.appendChild(title);
     return root;
   };
   ```

3. Add matching CSS in `extensions/son-of-anton/media/chat.css` under
   the existing `.ui-block-...` family.
4. Document the props in this file.

## Response routing

* `respond(value)` → host posts a synthetic user turn of the form
  `UI block response (block-xxxxxxxx): {"name":"Alice"}`. The agent sees
  it as a normal user message and can react.
* `onAction(name, payload)` → host posts
  `UI block action (block-xxxxxxxx.action_name): { ... }`.

The block is frozen (inputs disabled, "Responded" pill shown) on
`respond`. `onAction` does not freeze the block — multiple actions can
fire from the same card.

## Persistence

Blocks are persisted as `<<<sota:uiblock data="<base64 JSON>">>>`
sentinels in the assistant message body. On reload they re-mount in
their initial, un-responded state. Live response state (frozen inputs,
"Responded" pill) is intentionally not persisted; it is a session-only
signal.

## Constraints

* No external dependencies. The chart renderer hand-draws SVG.
* Renderers must escape user/LLM strings before injecting into HTML.
* The first emit creates the block. Duplicate emits with the same
  `blockId` are logged and ignored.
