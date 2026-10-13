---
name: update-skills
description: Create or update repository skills and instructions when major learnings are discovered during a session. Use when the user says "learn!", when a significant pattern or pitfall is identified, or when reusable domain knowledge should be captured for future sessions.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Update Skills & Instructions

When a major repository learning is discovered — a recurring pattern, a non-obvious pitfall, a crucial architectural constraint, or domain knowledge that would save future sessions significant time — capture it as a skill or instruction so it persists across sessions.

## When to Use

- The user explicitly says **"learn!"** or asks to capture a learning
- You discover a significant pattern or constraint that cost meaningful debugging time
- You identify reusable domain knowledge that isn't documented anywhere in the repo
- A correction from the user reveals a general principle worth preserving

## Decision: Skill vs Instruction vs Learning

**Add a learning to an existing instruction** when:
- The insight is small (1-4 sentences) and fits naturally into an existing instruction file
- It refines or extends an existing guideline
- Follow the pattern in `.github/instructions/learnings.instructions.md`

**Create or update a skill** (`.github/skills/{name}/SKILL.md` or `.agents/skills/{name}/SKILL.md`) when:
- The knowledge is substantial (multi-step procedure, detailed guidelines, or rich examples)
- It covers a distinct domain area (e.g., "how to debug X", "patterns for Y")
- Future sessions should be able to invoke it by name

**Create or update an instruction** (`.github/instructions/{name}.instructions.md`) when:
- The rule should apply automatically based on file patterns (`applyTo`) or globally
- It's a coding convention, architectural constraint, or process rule
- It doesn't need to be invoked on demand

## Procedure

### 1. Identify the Learning

Reflect on what went wrong or what was discovered:
- What was the problem or unexpected behavior?
- Why was it a problem? (root cause, not symptoms)
- How was it fixed or what's the correct approach?
- Can it be generalized beyond this specific instance?

### 2. Check for Existing Files

Before creating new files, search for existing skills and instructions that might be the right home:

```
# Check existing skills
ls .github/skills/ .agents/skills/ 2>/dev/null

# Check existing instructions
ls .github/instructions/ 2>/dev/null

# Search for related content
grep -r "related-keyword" .github/skills/ .github/instructions/ .agents/skills/
```

### 3a. Add to Existing File

If an appropriate file exists, add the learning to its `## Learnings` section (create the section if it doesn't exist). Each learning should be 1-4 sentences.

### 3b. Create a New Skill

If the knowledge warrants a standalone skill:

1. Choose the location:
   - `.github/skills/{name}/SKILL.md` for project-level skills (committed to repo)
   - `.agents/skills/{name}/SKILL.md` for agent-specific skills
2. Create the directory and SKILL.md with frontmatter:

```markdown
---
name: {skill-name}
description: {One-line description of when and why to use this skill.}
---

# {Skill Title}

{Body with guidelines, procedures, examples, and learnings.}
```

3. The `name` field **must match** the parent folder name exactly.
4. Include concrete examples — skills with examples are far more useful than abstract rules.

### 3c. Create a New Instruction

If the knowledge should apply automatically:

```markdown
---
description: {When these instructions should be loaded}
applyTo: '{glob pattern}' # optional — auto-load when matching files are attached
---

{Content of the instruction.}
```

### 4. Quality Checks

Before saving:
- Is the learning **general enough** to help future sessions, not just this one?
- Is it **specific enough** to be actionable, not just a vague principle?
- Does it include a **concrete example** of right vs wrong?
- Does it avoid duplicating knowledge already captured elsewhere?
- Is the description clear enough that the agent will know **when** to invoke/apply it?

### 5. Inform the User

After creating or updating the file:
- Summarize what was captured and where
- Explain why this location was chosen
- Note if any existing content was updated vs new content created
