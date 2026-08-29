# Split Runtime/Editor Control

Use this path only when one enterprise control governs two independent behaviors:

1. agent behavior executed inside the runtime; and
2. editor/workbench behavior implemented by VS Code.

## Separation

- Add the authoritative managed setting and enforcement in the runtime.
- Add a VS Code policy only for the editor-owned behavior.
- Keep both projections semantically aligned.
- Do not duplicate runtime matching or enforcement in VS Code.
- Do not use editor UI suppression as a substitute for runtime enforcement.

If the runtime lacks an exact capability, add it first and retain existing editor
behavior until the authoritative replacement exists.

## Integration Checks

- Permission authorization remains separate from sandbox containment.
- Create, resume, removal, peer, subagent, and cloud behavior are explicit.
- Runtime-effective diagnostics include all enforced layers, or the gap is documented.

Follow both:

- [SDK/runtime managed setting](./sdk-runtime-policy.md)
- [VS Code configuration policy](./vscode-policy.md)
