---
mode: edit
---
Analyze the user requested part of the codebase (use a suitable <placeholder>) to generate or update `.github/instructions/<placeholder>.instructions.md` for guiding developers and AI coding agents.

Focus on practical usage patterns and essential knowledge:
- How to use, extend, or integrate with this code area
- Key architectural patterns and conventions specific to this area
- Common implementation patterns with code examples
- Integration points and typical interaction patterns with other components
- Essential gotchas and non-obvious behaviors

Source existing conventions from `.github/instructions/*.instructions.md`, `CONTRIBUTING.md`, and `README.md`.

Guidelines:
- Write concise, actionable instructions using markdown structure
- Document discoverable patterns with concrete examples
- If `.github/instructions/<placeholder>.instructions.md` exists, merge intelligently
- Target developers who need to work with or extend this code area

Update `.github/instructions/<placeholder>.instructions.md` with header:
```
---
description: "How to work with the <placeholder> part of the codebase"
---
```
