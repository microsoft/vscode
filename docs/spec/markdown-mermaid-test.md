# Markdown Mermaid Test

This file is a small rendering test for Markdown previews in Forge.

## Plain Markdown

- Item one
- Item two
- Item three
- Item four
- Item five
- Item six
- Item ten

## Mermaid

```mermaid
flowchart TD
    A[Open Markdown Preview] --> B{Mermaid rendered?}
    B -- Yes --> C[Support is enabled]
    B -- No --> D[Code block is shown as plain text]
```

```mermaid
sequenceDiagram
    participant User
    participant Editor
    participant Preview

    User->>Editor: Open Markdown file
    Editor->>Preview: Render content
    Preview->>Preview: Detect Mermaid blocks
    Preview-->>User: Display diagram
```

## Expected Result

If Mermaid support is wired into the preview path, the diagram above should render as a flowchart.
Otherwise, it should appear as a normal fenced code block.
