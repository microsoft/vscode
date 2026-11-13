# Native components in responses

## Scope

The Agents window opts into a shared chat renderer for **explicit, closed `vscode-ui` fenced blocks in assistant responses**. A block composes components from a fixed catalogue: columns and stack layout, text, metric, badge, table, bar chart, and disclosure. VS Code renders them as ordinary DOM in the transcript, with its own typography, theme tokens, focus behavior, and scrolling. There is no webview or iframe.

The agent supplies content, data, and composition. VS Code owns every component's implementation and appearance: the agent picks semantic variants, such as a positive tone, and the stylesheet maps them to registered theme colors, the chart palette, and the design-system spacing, radius, and type roles. Nothing in a block is evaluated. Tags and quoted literal attributes are the whole language; expressions, imports, scripts, HTML, classes, and styles are rejected.

The `chat.nativeComponents.enabled` setting defaults to `false` and is experimental. While it is off, or AI features are disabled, these blocks display as source code; changing either setting updates existing responses without reloading. Ordinary code fences, user messages, annotated file edits, filtered responses, and other chat surfaces keep their existing behavior. Providers need no new protocol response type: the original Markdown remains the persisted, copied, and exported response.

This is independent of HTML previews. `vscode-ui` and `html-preview` each have their own language, setting, renderer, and fallback, and enabling one does not affect the other.

### Where the renderer lives

Shared chat code holds only a small seam: the fence check, the renderer contract, and a registration point ([chatNativeComponents.ts](../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatNativeComponents.ts)). The parser, components, and stylesheet are registered by the desktop and desktop-web entry ([chat.desktop.contribution.ts](../../browser/chat.desktop.contribution.ts)). The phone bundle does not import that file, so it carries none of them: its stylesheet budget has no room for the component styles. On the phone, `vscode-ui` blocks are shown as source and the authoring skill is not offered.

### Format

The schema is versioned ([nativeComponents.ts](../../../../../workbench/contrib/chat/common/nativeComponents/nativeComponents.ts)). A fence that declares no version is version 1; a fence may declare one, as in `vscode-ui v1`. Any other fence option, and any version this build does not support, is rejected with a reason, so a later incompatible revision fails closed in older builds.

A block is bounded: 32,000 characters, 2,000 components, 8 levels of nesting, 12 columns and 100 rows per table, and 24 bars per chart. A block that exceeds a bound, or contains anything outside the catalogue, is rejected as a whole rather than truncated.

### Behavior

- A block renders once its closing fence arrives, while the rest of the response keeps streaming. Until then, and whenever it does not validate, it is an ordinary code block; an invalid block also shows a short reason with the line.
- Visuals have no title bar or permanent buttons. Right-click a visual, or focus it and press Shift+F10, for **Show Source**, which toggles the original markup in the standard code editor.
- Columns share the width equally and wrap down to a single column as the chat narrows. A wide table scrolls inside its own box. Adjacent badges share a line. A long unbroken string wraps rather than widening the response.
- Whitespace in text collapses as it does in HTML, so a non-breaking space written as `&#160;` keeps a value and its unit together.
- A table is a real table with column headers. A bar chart is exposed as a table of its labels and values, and shows every value as text. A tone is an icon with a name, reinforced by color, never color alone. Disclosures are native and keyboard-operable. Keyboard focus draws a ring around the visual; a click inside it does not.
- The chat Accessible View presents each rendered visual as text: metrics as `label: value`, tables row by row, charts as labelled values. That includes a visual inside a list item or a block quote, and one whose block a file reference splits into several response parts. Blocks that are shown as source read as source.
- Transcript Find searches the original markup, as it does for any code block, and reveals the source when a match in it is selected. Rendered text is not matched a second time.
- The Show Source choice is remembered per block, as it is for HTML previews. Expanded disclosures are remembered while the window is open, so they survive scrolling a response out of view and back.

The built-in [vscode-ui skill](../../../../skills/vscode-ui/SKILL.md) provides on-demand authoring guidance. It is offered only while native components and AI features are enabled, and only where they render. Rendering does not depend on the skill, and its instructions are not injected into every turn.

## Try it

Enable `chat.nativeComponents.enabled`, then ask an agent to answer with a `vscode-ui` fence, or invoke the built-in `/vscode-ui` skill:

> Compare the full and incremental build times as a native visual, with the key numbers, a bar chart, and how you measured them.

For deterministic testing, use this response:

````markdown
The incremental build is considerably faster.

```vscode-ui
<Columns>
  <Metric label="Full build" value="12.4 s" />
  <Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive" />
  <Metric label="Flaky tests" value="7" tone="warning" />
</Columns>
<Badge tone="positive">Passing</Badge>
<Badge>Draft</Badge>
<BarChart title="Build duration" unit="s">
  <Bar label="Full build" value="12.4" />
  <Bar label="Incremental build" value="1.8" />
</BarChart>
<Table caption="Duration by target">
  <Column>Target</Column>
  <Column align="end">Before</Column>
  <Column align="end">After</Column>
  <Row><Cell>Full build</Cell><Cell>12.9 s</Cell><Cell>12.4 s</Cell></Row>
  <Row><Cell>Incremental build</Cell><Cell>11.7 s</Cell><Cell>1.8 s</Cell></Row>
</Table>
<Disclosure summary="How this was measured">
  <Text>Median of five runs on a warm cache.</Text>
</Disclosure>
```

Most of the improvement comes from caching.
````

To see the fallback, change `<BarChart` and `</BarChart>` to `<Chart` and `</Chart>`: the block shows its source with "Line 8: Unknown component "Chart"".

## Testing scenarios

| Scenario | Expected result | Coverage |
| --- | --- | --- |
| Response visual | The components render inline between the surrounding Markdown; no frame is created; the source keeps the exact original text. | Unit |
| Rendering preference | With `chat.nativeComponents.enabled` at its default (`false`), or after turning it off while a transcript is visible, blocks show source. Turning it on renders them without a reload. `chat.disableAIFeatures` has the same effect. Changing `chat.htmlPreview.enabled` changes nothing here. Surfaces that did not opt in stay source-only. | Chat-list unit |
| Ordinary code, user prompt, filtered response, annotated file | Remains code; no visual is created. | Unit |
| Streaming | No visual before a real closing fence, including a response stopped mid-block. A closed block renders while the explanation after it streams, and is not rebuilt by later updates: an expanded disclosure and the source toggle stay as they are. | Unit |
| Fences | Backtick and tilde fences of at least three characters work, with an optional `v1`; a short or mismatched closing fence does not. | Unit |
| Strict validation | Unknown components and attributes, HTML tags, `style`, `class` and event attributes, expressions in braces, comments, imports, loose text, unquoted or repeated attributes, misplaced children, mismatched tags, and non-numeric bar values are each rejected with the line and a reason. | Parser unit |
| Limits | Each bound is accepted at the limit and rejected one past it. | Parser unit |
| Untrusted text | Markup-like text in every label, value, cell, caption, and summary is displayed literally; no element, class, or style comes from it. | Renderer unit |
| Invalid block | Source is shown with a readable notice; there is no Show Source toggle and no visual tab stop; code-block navigation focuses the source editor. | Unit |
| Show Source | Right-click or Shift+F10 opens a menu with Show Source, checked while source is shown. Toggling moves focus to what is shown. In source mode the editor's own context actions are offered too. | Unit + manual |
| Row recycling | Scroll a response with a visual far out of view and back, also after resizing the chat: one visual is shown, with the same disclosures expanded and the same source choice. A disposed part no longer reacts to its old elements. | Chat-list + unit |
| Narrow chat | Columns go from side by side to stacked; a wide table scrolls horizontally without widening the response; badges wrap; a long unbroken label, value, unit, or summary wraps. | Renderer unit (real layout) + fixture |
| Tables while streaming | A table inside a visual is never wrapped by the Markdown table scroller, however many updates follow; Markdown tables in the same response still are. | Unit |
| Themes | Light, dark, and both high-contrast themes; switching theme while a visual is shown updates it, because every color is a theme variable. | Fixture screenshots + manual for the live switch |
| Accessibility | Tab reaches the visual and draws a focus ring around it; a click inside it draws none. Disclosures toggle with Enter or Space; a screen reader finds a table with column headers, a chart as a table of labelled values, and named tone icons. The Accessible View shows the text alternative where the visual renders, also inside a list item or a block quote, and the source elsewhere, such as in a filtered response. Accessibility Help documents the feature only while it is enabled. | Unit + manual screen reader |
| Find | A match in prose is highlighted there and leaves the visual alone. A match in the markup reveals the source without taking focus from Find. Text that appears in both the markup and the rendered visual is never highlighted inside the visual. | Chat-list + Find unit |
| Authoring guidance | `/vscode-ui` is not offered by default. It appears across discovery, slash commands, file listings, and harness forwarding while the setting and AI features are on, and disappears when either is off or the renderer is absent. | Built-in discovery unit |
| Restored conversation | Reopen a session whose response contains a visual: the persisted Markdown renders again. | Manual |
| Phone | With the setting on, blocks show source and the skill is not offered. | Skill-gating unit + manual |
