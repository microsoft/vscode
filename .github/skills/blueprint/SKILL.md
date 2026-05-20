---
name: blueprint
description: "Use when working in a repository that contains a `.blueprintfiles` manifest, which splits files into a blueprint (the spec) and an implementation. Use this skill to refine the blueprint without modifying implementation files, or to implement changes described by the blueprint without modifying the blueprint. Triggers: blueprint, spec, .blueprintfiles, /blueprint, /implement, blueprint-only change, implement the blueprint."
---

# Blueprint Workflow

This repository (and any repository that contains a `.blueprintfiles` manifest) is organized around a split between two groups of files:

- **Blueprint files**: files and directories listed in `.blueprintfiles`. They are the specification.
- **Implementation files**: every other file in the workspace. They are the realization of the blueprint.

The blueprint describes intent and behavior. The implementation makes that intent real.

## When to Use

Activate this workflow when any of the following are true:

- The workspace contains a `.blueprintfiles` file at its root.
- The user asks to refine, restructure, edit, or review the blueprint.
- The user asks to implement, build, or update the implementation based on the blueprint.
- The user runs `/blueprint` or `/implement`.
- A task could touch both groups and the boundary needs to be respected.

If `.blueprintfiles` does not exist in the workspace root, this skill does not apply.

## Core Rules

1. `.blueprintfiles` is the single source of truth for classification. Do not guess from folder or file names.
2. Each task has a primary side: blueprint or implementation. Edits stay on that side unless the user explicitly asks to cross the boundary.
3. The blueprint is treated as the specification when implementing.
4. The implementation is not modified during blueprint work; intended behavior is described in the blueprint instead.
5. The blueprint is not modified during implementation work; ambiguities are called out in the response instead.
6. Cross-side changes must be called out explicitly in the response summary.

## Procedure

### 1. Classify

- Read `.blueprintfiles` from the workspace root.
- Skip empty lines and lines starting with `#` (comments). Treat every remaining line as a literal file path or directory path, relative to the workspace root.
- A path is a blueprint path if it equals a listed file path or is inside a listed directory (e.g. `blueprint/foo.md` belongs to a listed `blueprint/`).
- All other paths are implementation paths.

### 2. Decide the mode

Pick exactly one of the two modes based on the user request, then follow the matching section below:

- **Blueprint mode**: the user wants to change the spec. Triggered by `/blueprint`, or by phrases like "update the blueprint", "refine the spec", "describe the behavior".
- **Implement mode**: the user wants to change the implementation to match the spec. Triggered by `/implement`, or by phrases like "implement this", "make the code do X from the blueprint".

If the request is ambiguous, ask the user which mode applies before editing.

If the request requires changes to both sides, prefer two sequential passes: refine the blueprint in blueprint mode first, then realize it in implement mode. Only combine the sides in a single pass when the user explicitly authorizes a boundary crossing.

### 3. Execute the mode

Follow only the section that matches the mode chosen in step 2.

#### Blueprint mode

1. **Read first**: read the affected blueprint files before editing.
2. **Edit**: only edit files that are classified as blueprint files. Do not touch implementation files. If the request would normally require implementation changes, describe the intended behavior in the blueprint instead.
3. **Verify (local scope)**: re-read the edited blueprint files and check that the changes are internally consistent and aligned with the user's request.
4. **Check overall consistency (whole-blueprint scope)**: review the rest of the blueprint to confirm the edit does not contradict, duplicate, or leave dangling references in other blueprint files. Reconcile any conflicts before finishing.

#### Implement mode

1. **Read first**: read the relevant blueprint files to understand the intended behavior, then read the implementation files you plan to change.
2. **Edit**: only edit implementation files. Do not modify blueprint files. If the blueprint is ambiguous or missing detail, prefer the smallest implementation that fits existing repository patterns and call out the ambiguity in the response.
3. **Verify**: check that there are tests covering all functionality described in the blueprint and run all tests. Add missing tests where needed (tests are implementation files). Then assess whether the implementation as a whole satisfies the entire blueprint.
4. **Repeat if incomplete**: if step 3's verification failed, or the assessment found gaps anywhere in the implementation, return to step 2 (re-reading any files as needed) and iterate. Stop when verification succeeds and the implementation fully matches the blueprint. If repeated iterations cannot close the gap (e.g. blueprint ambiguity, environment failures), stop and ask the user how to proceed.

### 4. Summarize scope

End the task with a short summary that names:

- The mode used (blueprint or implement).
- The files changed, grouped by side.
- Any user-authorized boundary crossings, and why they were necessary.

## Refusals and Escalations

- Refuse to silently make cross-side edits. If a blueprint task seems to require implementation changes, stop and ask, or update the blueprint with the described behavior instead.
- Refuse to invent classifications. If `.blueprintfiles` is missing or unreadable, stop and ask the user how to proceed rather than guessing.

## Related Customizations

- The `/blueprint` and `/blueprint-implement` prompts in `.github/prompts/` are thin entry points to this workflow.
