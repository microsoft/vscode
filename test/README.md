# VS Code Tests

## Contents

This folder contains the various test runners for VS Code. Please refer to the documentation within for how to run them:

* `unit`: our suite of unit tests ([README](unit/README.md))
* `integration`: our suite of API tests ([README](integration/browser/README.md))
* `smoke`: our suite of automated UI tests ([README](smoke/README.md))
* `sanity`: release sanity tests ([README](sanity/README.md))

## Image generation in Agent Host

Copilot image generation is provided by its native runtime and observed by the Copilot Agent Host harness. It requires a compatible runtime/SDK and backend image-generation access. There is no local extension-host image generator.

The shared Chat renderer handles both Copilot's `image_generation` and Codex's `image_gen.imagegen` tool calls. Real generation and the development mock default to the `GlyphRevealFinal` treatment: a compact Glyph Wave loading band below the non-shimmering prompt dropdown and its image icon, followed by a single ASCII Resolve pass when the image loads. The band changes to the image's width before opening to its height, and its motion eases from 2x to normal speed. The title says `Using <model name> to generate an image` when the host supplies image-model metadata. Only persistent progress rotates through painting-themed phrases such as `Mixing the colors` and `Giving imagination a canvas`; they do not represent backend stages. Each overlapping call keeps its own dropdown while sharing one loading band. A single completed image sits below the input/output dropdown, with Save immediately to the image's right; galleries retain their existing layout and errors leave a failed dropdown. Restored history shows the image immediately without replaying the reveal. Codex availability remains controlled by its provider; the current harness enables generation for OpenAI models with a ChatGPT sign-in.

To inspect the UI without image-generation access, use the `chat/generatedImages` Component Explorer fixtures, including the Copilot/Codex selector in `Preview`. These fixtures cover the shared glyph presentation across running, completed, failed, overlapping, and reduced-motion states. They do not register tools or make image-generation requests.

The default reveal reserves Save's space to the right from the start and keeps the action hidden until the reveal finishes. It never adds a temporary toolbar row below the image, so revealing Save does not shift the image or following content. The final reveal frame preserves the image's fractional CSS dimensions rather than the rounded canvas sample size. Running and completed tool dropdowns keep the same spacing above the glyph band, whether collapsed or expanded. The glyph band retains its width and keeps painting while the image bytes load, then expands into the loaded image without a blank intermediate state.

Each response remembers only the natural dimensions of images it has displayed. Recycled list rows reserve that geometry while bytes reload, with CSS adapting it to the current chat width and height limit. The response-scoped cache uses stable embedded-resource identity rather than gallery filenames; it does not retain image bytes or DOM, is refreshed when an image changes, and is cleared for a resource whose load fails. Embedded images go directly to the browser decoder without a synchronous JavaScript base64-to-bytes copy during row mounting. First-time reveals still start from the glyph band; images whose dimensions are not yet known still need their initial decode.

Multiple successful calls share a gallery that updates regardless of completion order. Optional image-model metadata identifies image tools even on hosts with different tool names, including failed and cancelled history entries. Copilot's native tool supplies embedded image contents; opaque SDK/MCP resource links are not advertised as readable AHP resources. Codex's host-backed resource mapping remains supported.

### Mock image generation in Copilot Agent Host

Source/development builds register `generate_image_mock` as an SDK client tool implemented entirely in VS Code's Copilot Agent Host. After rebuilding and restarting the Agent Host, open a Copilot harness chat or Agents-window session and ask:

```text
Use generate_image_mock with the prompt "Draw a happy puppy" to test image rendering.
```

The tool waits five seconds and returns the [bundled sample PNG](../src/vs/platform/agentHost/node/copilot/media/imageGenerationMock.png). It exercises the normal image-generation placeholder, persistent progress, prompt/output dropdown, large image, and Save action. Stop cancels the wait. Changing the prompt does not change the sample.

The mock does not call CAPI or an image provider, and needs no image-generation entitlement or custom runtime. Normal chat-model access is still required for the model to call the tool. It is absent from packaged builds and ephemeral sessions, does not replace the real `image_generation` tool, and does not restore the local extension-host implementation.

### Image reveal preview

`chat/generatedImages/chatGeneratedImages/GlyphRevealFinal` renders the same implementation used by real generation and the mock, with no alternate treatment controls. The compact band sweeps right through binary digits spelling `HAPPY_CODING!`, changes to the image's width, and opens to its height. A single glyph pass resolves into finer glyphs, the image's palette, its true colors, and finally the image itself. Motion starts at 2x speed and settles to normal speed.

The image dimensions are unknown until its bytes load, so the loading band stays 320 px wide (bounded by its container) and 50 px tall. Reduced motion and high-contrast themes hold a still loading frame and show the loaded image without a reveal. Restored results do not replay the animation.

For UI iteration without model access, use the repository's Node version and start Component Explorer:

```sh
npm run transpile-client
npm run serve-out-rspack
```

At the server's printed URL, select `chat/generatedImages/chatGeneratedImages/GlyphRevealFinal/Dark` (or Light) and choose **Complete Generation**. The fixture input supports Copilot/Codex/mock harnesses, narrow layout, reduced motion, and delayed referenced images. With `source: Referenced`, **Load Image** releases the bytes independently of tool completion. `LoadingLifecycle` also exercises follow-up turns and viewport sizing. No model call or image-generation entitlement is required.

Reload the fixture to replay it. If hot reload reports a duplicate workbench command registration after a TypeScript edit, reload the browser page.
