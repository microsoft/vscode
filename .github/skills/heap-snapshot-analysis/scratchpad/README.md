# This folder is a scratchpad for heap snapshot investigation scripts.
# Files here are gitignored — write freely.
#
# Organization:
#   Put each investigation in a dated subfolder:
#     scratchpad/2026-04-09-chat-model-retainers/analyze.mjs
#     scratchpad/2026-04-09-chat-model-retainers/findings.md
#
#   Each subfolder should include a findings.md documenting all ideas
#   considered, decisions made, and before/after measurements.
#
# Example usage:
#   node --max-old-space-size=16384 scratchpad/2026-04-09-chat-model-retainers/analyze.mjs
#
# Import helpers like:
#   import { parseSnapshot, buildGraph } from '../helpers/parseSnapshot.ts';
#   import { compareSnapshots, printComparison } from '../helpers/compareSnapshots.ts';
#   import { findRetainerPaths } from '../helpers/findRetainers.ts';
