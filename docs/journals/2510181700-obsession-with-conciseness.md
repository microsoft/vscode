# The Conciseness Obsession: When Better UX Feels Like Fighting AI Nature

**Date**: 2025-10-18 17:00
**Severity**: Low
**Component**: Agent Communication / Reporting
**Status**: Ongoing

## What Happened

Spent multiple commits across the last 2 days adding "IMPORTANT: Sacrifice grammar for the sake of concision" and "enforce concise reporting" to nearly every agent and command file. Added similar directives to planner, researcher, scout, tester, code-reviewer, debugger, and ui-ux-designer agents.

Recent commits (8f08867, d856c69) show systematic updates adding concision rules to 10+ files.

## The Brutal Truth

This is exhausting because we're fighting against the fundamental nature of large language models - they're trained to be verbose, explanatory, and thorough. We're essentially spending development time telling an AI "please don't act like an AI."

The maddening part is that it's absolutely necessary. Agent-to-agent reports that run 2000 words when 200 would do create context pollution. Human developers don't read them. Other agents can't extract signal from noise. But we've now littered our codebase with variations of "BE CONCISE" like we're shouting at someone who doesn't listen.

What makes this particularly painful is knowing we'll have to do this AGAIN when models update. Each new model generation might reset these tendencies, requiring another round of "no really, we mean it, be brief."

## Technical Details

Pattern applied across files:
```markdown
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.
```

Also added `argument-hint` metadata to 25+ command files for better CLI UX:
```markdown
---
argument-hint: [user-requirements]
---
```

The argument hints are actually elegant - single line, clear value. The conciseness directives feel like patches over fundamental AI verbosity issues.

## What We Tried

**Iteration 1**: "Write concise reports" - Ignored. Reports still 1500+ words.

**Iteration 2**: "Keep reports under 500 words" - Partially worked, but sacrificed important details.

**Iteration 3**: "Sacrifice grammar for concision" - Current approach. Works but feels wrong.

**Alternative considered**: Structured output formats (JSON, YAML) forcing brevity through schema constraints. Rejected because we lose human readability in the process.

## Root Cause Analysis

The root issue is we're using natural language as the primary interface between agents. Natural language is inherently imprecise and verbose. We chose this for flexibility and human oversight, but we're paying the cost in verbosity management.

The deeper problem: we want reports that are:
- Detailed enough for humans to review when needed
- Concise enough for agents to process efficiently
- Structured enough to extract decisions
- Natural enough to scan quickly

These requirements are partially contradictory. We're solving for an impossible optimization problem by adding "BE CONCISE" everywhere and hoping the model figures out the nuance.

## Lessons Learned

**What works:**
- Argument hints for CLI - clear, immediate value
- Explicit "sacrifice grammar" directive - gives permission to be terse
- Asking for "unresolved questions at the end" - structures output

**What doesn't scale:**
- Repeating the same directive in 10+ files
- Trusting that future model versions respect these patterns
- Manual enforcement through code review

**Better approach:**
1. Create a `report-templates.md` defining output formats
2. Reference templates from agents: "Follow report template X"
3. Build validation tools that measure report length/density
4. Consider structured sections: Summary (50 words), Details (bullets), Actions (numbered)

## Next Steps

1. Consolidate conciseness rules into shared `./docs/reporting-standards.md`
2. Update agents to reference standards instead of inline directives
3. Build a simple report analyzer that flags verbose outputs
4. Document WHY we optimize for conciseness (context limits, readability, cost)
5. Consider whether some reports should be split: short version for agents, detailed for humans

The honest truth: we're probably 70% of the way there. Reports ARE getting shorter. But we've achieved this through brute force repetition rather than elegant design. That's not satisfying, but it's pragmatic.

And maybe that's the lesson - sometimes "good enough that works" beats "architecturally perfect but theoretical."
