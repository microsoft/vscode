---
agent: agent
description: 'Implement changes described by the blueprint without modifying the blueprint'
tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'extensions', 'todos', 'runTests']
---
Follow the `blueprint` skill in `.github/skills/blueprint/SKILL.md` in **implement mode**.

Read `.blueprintfiles` from the workspace root, read the relevant blueprint files to understand the intended behavior, then only edit implementation files to make them match the blueprint. Do not modify blueprint files. If the blueprint is ambiguous or missing detail, call out the ambiguity in your response rather than editing the blueprint.
