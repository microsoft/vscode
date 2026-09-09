---
name: feedback-learning
description: Classify and record explicit corrective feedback without turning skills or instructions into append-only knowledge dumps.
---

# Feedback learning

Use this skill when a user explicitly corrects an implementation or design approach, rejects a pattern, or asks the agent to learn from feedback, except when the user invokes the literal `learn!` trigger.

Literal `learn!` requests are governed exclusively by `.github/instructions/learnings.instructions.md` and are outside this skill's scope. Do not replace or reinterpret that instruction.

## Goal

Preserve reusable knowledge in the smallest authoritative artifact. A correction is not automatically a permanent rule.

## Workflow

1. **Identify the correction**
   - What was wrong?
   - Why was it wrong?
   - What approach did the user prefer?
   - Which paths or subsystem does it affect?

2. **Search before writing**
   - Check applicable instructions, skills, design documents, tests, and scoped
     learning files.
   - Update an existing rule instead of adding a duplicate.

3. **Classify the feedback**

   | Feedback kind | Destination |
   |---------------|-------------|
   | Task-specific preference or one-off adjustment | Do not persist |
   | Concrete behavior that must not regress | Regression test |
   | Stable subsystem architecture or product invariant | Relevant design/specification document |
   | Universal repository rule | Applicable instruction file |
   | Reusable but not yet mature or proven guidance | `.github/learnings/<area>.md` |
   | Tool-driven workflow | Relevant skill |

4. **Generalize carefully**
   - Preserve the principle, not the incident chronology.
   - Do not include temporary symbol names, line numbers, or implementation
     details unless they define the durable contract.
   - Do not turn a single rejected implementation into a universal prohibition
     without broader evidence.

5. **Record once**
   - Design documents and tests are authoritative.
   - A learning inbox entry is temporary. When promoted, remove the inbox entry
     in the same change.
   - Never copy the same rule into a skill, instruction, and design document.
   - Before adding an inbox entry, compact the target file using the maintenance
     rules below.

6. **Validate**
   - Confirm the destination applies to the affected path.
   - Check links and remove superseded or contradictory guidance.

## Learning inbox format

Create or update `.github/learnings/<area>.md` using:

```markdown
# Area learning inbox

Last reviewed: YYYY-MM-DD

## Short topic

- **Scope:** `affected/path/**`
- **Learning:** Generalized guidance in one or two sentences.
- **Evidence:** Why this is reusable beyond the current task.
- **Disposition:** Candidate for `<design document, instruction, skill, or test>`.
```

Keep entries concise. Each area inbox is limited to ten topics and 8 KB. If a new entry would exceed either limit, promote, merge, or remove existing entries before deciding whether the new feedback deserves persistence.

## Reading learnings

Do not inject learning inboxes into every task. Search the relevant file's headings and `Scope` fields first, then read only matching entries. Learning inboxes supplement source code, tests, and design documents; they are not a prerequisite for unrelated work and are not authoritative over them.

## Compaction and garbage collection

Compact an inbox before every write. Also perform a full review when an inbox is at either limit or its `Last reviewed` date is more than 90 days old when read. During review:

- promote stable architectural guidance into the owning specification;
- encode concrete behavior in tests;
- merge overlapping entries into one general principle;
- remove obsolete, contradicted, already-promoted, or weakly supported entries;
- update `Last reviewed` after checking every retained entry against the current source and authoritative documentation.

An inbox may shrink to zero entries. Do not retain a learning merely because it might be useful someday.
