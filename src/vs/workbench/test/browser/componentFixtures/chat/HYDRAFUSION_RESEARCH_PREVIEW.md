# HydraFusion Research Preview

This Component Explorer fixture demonstrates a proposed HydraFusion orchestration experience using VS Code's real chat presentation components. The workflows, constituent model activity, AIC usage, and outputs are simulated for design research. This branch does not add HydraFusion runtime support to VS Code.

## Run the preview

Fetch and switch to the shareable branch:

```bash
git fetch origin eli/hydra-ui
git switch --track origin/eli/hydra-ui
```

From the repository root:

```bash
npm install
npm run compile-client
npm run serve-out-rspack
```

Open the port printed by the development server with this path:

```text
/___explorer?search=HydraFusion&fixture=chat%2FhydraFusion%2FchatHydraFusionOrchestration%2FResearchPreview%2FDark
```

For the default port, the complete URL is:

```text
http://localhost:5123/___explorer?search=HydraFusion&fixture=chat%2FhydraFusion%2FchatHydraFusionOrchestration%2FResearchPreview%2FDark
```

If port 5123 is already in use, use the fallback port reported by the server. For example, the second local copy may be available on port 5124.

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
