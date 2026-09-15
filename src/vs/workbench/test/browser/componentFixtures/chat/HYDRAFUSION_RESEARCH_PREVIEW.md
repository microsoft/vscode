# HydraFusion Research Preview

This Component Explorer fixture demonstrates a proposed HydraFusion orchestration experience using VS Code's real chat presentation components. The workflows, constituent model activity, AIC usage, and outputs are simulated for design research. This branch does not add HydraFusion runtime support to VS Code.

## Run the preview

Fetch and switch to the shareable branch:

```bash
git fetch upstream eli/hydra-ui
git switch --track upstream/eli/hydra-ui
```

From the repository root:

```bash
npm install
npm run compile-client
npm run serve-out-rspack
```

Open Component Explorer at the address printed by the development server, search for `HydraFusion`, and select:

```text
chat / hydraFusion / chatHydraFusionOrchestration / ResearchPreview / Dark
```

If the default port is already in use, open the fallback port reported by the server.

## Explore the design

- **Workflow:** Compare Single, Cascade, and Critique.
- **Stage:** Inspect a specific point in the workflow or use **Play all** for cumulative real-time playback.
- **Thinking detail:** Compare activity-only presentation with simulated reasoning and intermediary output.
- **Models:** Hide model names, show them inline in phase titles, or reveal the distinct models by hovering or focusing the model-count text.
- **Initial state:** Start orchestration details expanded or collapsed.
- **Theme:** Replace the final `Dark` fixture suffix with `Light`, `DarkHighContrast`, or `LightHighContrast`.

The usage footer reports the number of distinct constituent models used, not the number of model passes. The illustrative bindings are:

- Single: GPT-5.6 Sol
- Cascade: GPT-5.6 Luna and GPT-5.6 Sol
- Critique: GPT-5.6 Luna and GPT-5.6 Terra
