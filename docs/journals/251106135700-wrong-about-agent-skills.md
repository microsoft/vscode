# I was wrong about Agent Skills and how I refactor them

**Date**: 2025-11-06 13:57
**Severity**: Medium
**Component**: Agent Skills System
**Status**: Resolved

## What Happened

Agent Skills dropped October 16th. I started building them immediately. Within two weeks, I had a `cloudflare` skill at 1,131 lines, a `shadcn-ui` skill at 850 lines, and a `nextjs` skill at 900 lines, `chrome-devtools` skill with >1,200 lines. 

My repo quickly got **400+ stars**.

But...

Every time Claude Code activated multiple related skills, I'd see context window grows dramatically. Loading 5-7 skills meant 5,000-7,000 lines flooding the context window immediately.

I thought this was just how it had to be. 
Put everything in one giant `SKILL.md` file so the agent has all the information upfront. 
More information = better results, right?

**Wrong.**

--

## The Brutal Truth

This is embarrassing because the solution was staring me in the face the whole time. **I was treating agent skills like documentation dumps** instead of what they actually are: **context engineering problems**.

The frustrating part is that I even documented the "progressive disclosure" principle in the `skill-creator` skill itself. 

> *I wrote it down.* 
> *I just didn't understand what it actually meant in practice.*

Here's what really pisses me off: I wasted two weeks debugging "context growing" issues and slow activation times when the problem was entirely self-inflicted. Every single one of those massive `SKILL.md` files was **loading irrelevant information 90% of the time**.

--

## Technical Details

### Before: The Disaster

```
.claude/skills/
├── cloudflare/           1,131 lines
├── cloudflare-workers/   ~800 lines
├── nextjs/               ~900 lines
├── shadcn-ui/            ~850 lines
├── chrome-devtools/      ~1,200 lines
└── (30 more similarly bloated files)
```

**Total**: ~15,000 lines across 36 skills (Approximately 120K to 300K tokens)

**Problem**: Activating the `devops` context (Cloudflare or Docker or GCloud continuously) meant loading 2,500+ lines immediately. Most of it was never used.

### After: Progressive Disclosure Architecture

I refactored using a 3-tier loading system:

**Tier 1: Metadata (always loaded)**
- YAML frontmatter only
- ~100 words
- Just enough for Claude to decide if the skill is relevant

**Tier 2: `SKILL.md` entry point (loaded when skill activates)**
- ~200 lines max
- Overview, quick start, navigation map
- Points to references but doesn't include their content

**Tier 3: Reference files & scripts (loaded on-demand)**
- 200-300 lines each
- Detailed documentation Claude reads only when needed
- Modular and focused on single topics

### The Numbers

**claude-code skill refactor:**
- Before: 870 lines in one file
- After: 181 lines + 13 reference files
- **Reduction: 79%** (4.8x better token efficiency)

**Complete Phase 1 & 2 reorganization:**
- Before: 15,000 lines across 36 individual skills
- After: Consolidated into 20 focused skill groups (2,200 lines initial load + 45 reference files)
  - `devops` (Cloudflare, Docker, GCloud - 14 tools)
  - `web-frameworks` (Next.js, Turborepo, RemixIcon)
  - `ui-styling` (shadcn/ui, Tailwind, canvas-design)
  - `databases` (MongoDB, PostgreSQL)
  - `ai-multimodal` (Gemini API - 5 modalities)
  - `media-processing` (FFmpeg, ImageMagick)
  - `chrome-devtools`, `code-review`, `sequential-thinking`, `docs-seeker`, `mcp-builder`,...
- **Reduction: 85%** on initial activation

**Real impact:**
- Activation time: ~500ms → <100ms
- Context overflow: Fast → Slow
- Relevant information ratio: ~10% → ~90%

--

## Root Cause Analysis

The fundamental mistake: **I confused "available information" with "loaded information".**

But again, there's a deeper misunderstanding: **Agent skills aren't documentation.**

They're **specific abilities and knowledge for development workflows**. Each skill represents a capability:
- `devops` isn't "Cloudflare documentation" - it's the ability to deploy serverless functions
- `ui-styling` isn't "Tailwind docs" - it's the ability to design consistent interfaces
- `sequential-thinking` isn't a guide - it's a problem-solving methodology

I had 36 individual skills because I treated each tool as needing its own documentation dump. Wrong. Skills should be organized by **workflow capabilities**, not by tools.

That's why consolidation worked:
- 36 tool-specific skills → 20 workflow-capability groups
- "Here's everything about Cloudflare" → "Here's how to handle DevOps deployment with Cloudflare, GCloud, Docker, Vercel."
- Documentation mindset → Development workflow mindset

The 200-line limit isn't arbitrary. It's based on how much context an LLM can efficiently scan to decide what to load next. 
Keep the entry point under ~200 lines, and Claude can quickly:
- Understand what the skill offers
- Decide which reference file to read
- Load just that file (another ~200-300 lines)

Total: 400-700 lines of highly relevant context instead of 1,131 lines of mixed relevance.

**This is context engineering 101 and I somehow missed it.**

---

## Lessons Learned

1. **The 200-line rule matters** - It's not a suggestion. It's the difference between fast navigation and context sludge.

2. **Progressive disclosure isn't optional** - Every skill over 200 lines should be refactored. No exceptions. If you can't fit the core instructions in 200 lines, you're putting too much in the entry point.

3. **References are first-class citizens** - I treated `references/` as "optional extra documentation." Wrong. References are where the real work happens. SKILL.md is just the map.

4. **Test the cold start** - Clear your context, activate the skill, and measure. If it loads more than 500 lines on first activation, you're doing it wrong.

5. **Metrics don't lie** - 4.8x token efficiency isn't marginal improvement. It's the difference between "works sometimes" and "works reliably."

The pattern is validated.

---

## In conclusion

**Skills ≠ Documentation**

Skills are capabilities that activate during specific workflow moments:
- Writing tests → activate `code-review`
- Debugging production → activate `sequential-thinking`
- Deploying infrastructure → activate `devops`
- Building UI → activate `ui-styling` + `web-frameworks`

Each skill teaches Claude *how to perform a specific development task*, not *what a tool does*.

That's why treating them like documentation failed. 
Documentation is passive reference material. 
**Skills are active workflow knowledge.**

Progressive disclosure works because it matches how development actually happens:
1. Scan metadata → Is this capability relevant to current task?
2. Read entry point → What workflow patterns does this enable?
3. Load specific reference → Get implementation details for current step

Each step is small, focused, and purposeful. 
That's how you build skills that actually help instead of overwhelming.

---

The painful part isn't that I got it wrong initially—Agent Skills are brand new (3 weeks old). 
The painful part is that I documented the solution myself without understanding it.

Two weeks of confusion. 
One weekend of refactoring.

Lesson learned: **context engineering isn't about loading more information. It's about loading the right information at the right time.**

If you want to see the repo, check this out:
- Before (`v1` branch): https://github.com/mrgoonie/claudekit-skills/tree/v1
- After (`main` branch): https://github.com/mrgoonie/claudekit-skills/tree/main