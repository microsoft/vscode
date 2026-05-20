---
agent: agent
description: 'Refine the blueprint (spec) without modifying implementation files'
---
Follow the `blueprint` skill in `.github/skills/blueprint/SKILL.md` in **blueprint mode**.

Read `.blueprintfiles` from the workspace root, classify the affected files, and only edit files that are classified as blueprint files. Do not modify implementation files. If the request would normally require implementation changes, describe the intended behavior in the blueprint instead.
