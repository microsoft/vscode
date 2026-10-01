# VS Code Tests

## Contents

This folder contains the various test runners for VS Code. Please refer to the documentation within for how to run them:

* `unit`: our suite of unit tests ([README](unit/README.md))
* `integration`: our suite of API tests ([README](integration/browser/README.md))
* `smoke`: our suite of automated UI tests ([README](smoke/README.md))
* `sanity`: release sanity tests ([README](sanity/README.md))

## Image generation in Agent Host

Copilot image generation is provided by its native runtime and observed by the Copilot Agent Host harness. It requires a compatible runtime/SDK and backend image-generation access. There is no local extension-host image generator.

The shared Chat renderer handles both Copilot's `image_generation` and Codex's `image_gen.imagegen` tool calls. While running, a non-shimmering dropdown exposes the available prompt above the unchanged binary-water animation. The title says `Using <model name> to generate an image` when the host supplies image-model metadata. Only persistent progress rotates through painting-themed phrases; they do not represent backend stages. Each overlapping call keeps its own dropdown while sharing one animation. Success shows the completed input/output dropdown and a large image with a Save action; errors leave a failed dropdown. Restored history uses the same renderer. Codex availability remains controlled by its provider; the current harness enables generation for OpenAI models with a ChatGPT sign-in.

To inspect the UI without image-generation access, use the `chat/generatedImages` Component Explorer fixtures, including the Copilot/Codex selector in `Preview`. The rendering explorations remain under `chat/imageLoadingStudies`; they do not register tools or make image-generation requests.

### Mock image generation in Copilot Agent Host

Source/development builds register `generate_image_mock` as an SDK client tool implemented entirely in VS Code's Copilot Agent Host. After rebuilding and restarting the Agent Host, open a Copilot harness chat or Agents-window session and ask:

```text
Use generate_image_mock with the prompt "Draw a happy puppy" to test image rendering.
```

The tool waits five seconds and returns the [bundled sample PNG](../src/vs/platform/agentHost/node/copilot/media/imageGenerationMock.png). It exercises the normal image-generation placeholder, persistent progress, prompt/output dropdown, large image, and Save action. Stop cancels the wait. Changing the prompt does not change the sample.

The mock does not call CAPI or an image provider, and needs no image-generation entitlement or custom runtime. Normal chat-model access is still required for the model to call the tool. It is absent from packaged builds and ephemeral sessions, does not replace the real `image_generation` tool, and does not restore the local extension-host implementation.
