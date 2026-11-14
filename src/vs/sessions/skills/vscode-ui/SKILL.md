---
name: vscode-ui
description: Present metrics, comparisons, tables, bar charts, and expandable details as native visuals inside an Agents window response. Use when numbers or a comparison are clearer shown than described. Not for diagrams, mockups, or standalone documents.
---
<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Native visuals

Use a native visual when showing data helps the user more than describing it: a few key numbers, a before-and-after comparison, a small table, or a bar chart. VS Code renders the visual itself, so it matches the user's theme and reads as part of the answer. Keep the explanation in ordinary Markdown around it, and honor the format the user asked for; most answers need no visual.

This is on-demand authoring guidance bundled with the Agents window. It is available while native visuals and AI features are enabled. Rendering does not depend on invoking this skill.

## Write a visual

Put the components in a closed Markdown code fence with the language `vscode-ui`. The visual appears once the closing fence arrives. Start the fence at the beginning of a line, not inside a list item or a block quote.

````markdown
The incremental build is considerably faster.

```vscode-ui
<Columns>
  <Metric label="Full build" value="12.4 s" />
  <Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive" />
</Columns>
<BarChart title="Build duration" unit="s">
  <Bar label="Full build" value="12.4" />
  <Bar label="Incremental build" value="1.8" />
</BarChart>
<Disclosure summary="How this was measured">
  <Text>Median of five runs on a warm cache.</Text>
</Disclosure>
```

Most of the improvement comes from caching.
````

The `chat.nativeComponents.enabled` setting controls rendering in the Agents window and is off by default. While it is off, the block is shown as source code. Do not change the user's setting unless asked.

## Components

You supply content, data, and composition. VS Code owns how every component looks, so there is nothing to style.

| Component | Attributes | Content |
| --- | --- | --- |
| `Stack` | none | Components, laid out top to bottom. |
| `Columns` | none | Components, laid out side by side in equal columns that stack when the chat is narrow. |
| `Text` | `variant`: `body` (default), `heading`, or `caption` | Plain text. |
| `Metric` | `label` and `value` (required), `delta`, `tone` | None. |
| `Badge` | `tone` | Plain text. Adjacent badges share a line. |
| `Table` | `caption` | Every `Column`, then every `Row`. |
| `Column` | `align`: `start` (default) or `end` | The column's header text. Use `end` for numbers. |
| `Row` | none | One `Cell` per column. |
| `Cell` | none | Plain text. |
| `BarChart` | `title` (required), `unit` | One `Bar` per value. |
| `Bar` | `label` and `value` (required) | None. |
| `Disclosure` | `summary` (required) | Components, hidden until the user expands them. |

A `tone` is `neutral` (default), `positive`, `negative`, or `warning`. It states what a value means; VS Code chooses the icon and color. Use a tone only where the meaning matters, not for decoration.

## Rules

The block is checked strictly. If anything in it is not valid, the user sees the source and the reason instead of the visual.

- Use only the components and attributes above. Names are case-sensitive.
- Write every attribute value as a quoted literal, such as `value="12.4"`. Expressions in braces, imports, scripts, HTML tags, comments, classes, styles, and colors are not supported.
- Put text only inside `Text`, `Badge`, `Column`, and `Cell`. It is plain text: Markdown and nested tags are not interpreted.
- Write `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#123;`, and `&#125;` for a literal `<`, `>`, `&`, `"`, `{`, and `}`.
- A `Bar` value is a number that is not negative, written with digits only, such as `12.4`. Put the unit in the chart's `unit` attribute, not in the value.
- A `Metric` value is text, so it can carry its unit, such as `1.8 s`.
- Limits: 32,000 characters, 2,000 components, 8 levels of nesting, 12 columns and 100 rows per table, and 24 bars per chart. Summarize or split larger data.
- Links, images, and code do not belong in a visual. Put them in Markdown outside the block.

For a diagram, a mockup, or a layout that these components cannot express, use Markdown, or an HTML preview when that is available.
