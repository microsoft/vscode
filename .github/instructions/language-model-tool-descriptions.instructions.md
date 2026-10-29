---
description: Use when writing or reviewing model-facing language model tool descriptions.
applyTo: "src/vs/**/*Tool.ts,src/vs/**/*Tools.ts"
---

# Language model tool descriptions

Apply these rules only when adding or changing a model-facing tool description, such as `modelDescription`. They do not govern display names, user-facing messages, confirmation text, or routine schema property descriptions.

- Begin with a direct imperative statement of the tool's capability.
- When tool selection could be ambiguous, state the positive invocation criteria explicitly.
- Place exclusions for likely near-neighbor requests immediately after the positive criteria.
- Describe persistent, external, costly, or otherwise consequential side effects.
- State meaningful defaults, cross-field requirements, and prerequisite tool calls that are not obvious from the input schema.
- Put approval, cancellation, retry, repeat-call, and polling guidance last.
- Do not repeat the complete input schema in prose.
- Keep descriptions concise and scale their detail with the ambiguity and cost of incorrect selection.
- Preserve terminology and formatting conventions used by related tools.
- Reserve `MUST`, `ONLY`, `CRITICAL`, and direct "Do not" language for likely, consequential misuse.

When correctness depends on specific model-facing guidance, add a focused test for the required semantic clauses. Prefer checking a small set of meaningful phrases or conditions over snapshotting the entire description. Do not test routine descriptive prose.
