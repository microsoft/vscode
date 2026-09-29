# VS Code Tests

## Contents

This folder contains the various test runners for VS Code. Please refer to the documentation within for how to run them:

* `unit`: our suite of unit tests ([README](unit/README.md))
* `integration`: our suite of API tests ([README](integration/browser/README.md))
* `smoke`: our suite of automated UI tests ([README](smoke/README.md))
* `sanity`: release sanity tests ([README](sanity/README.md))

## Image generation in Agent Host

Copilot image generation is provided by its native runtime and observed by the Copilot Agent Host harness. It requires a compatible runtime/SDK and backend image-generation access. There is no local extension-host image generator or client-side mock tool.

The shared Chat renderer handles both Copilot's `image_generation` and Codex's `image_gen.imagegen` tool calls. Both show the binary-water placeholder and persistent progress while running, followed by an expandable input/output dropdown and a large image with a Save action on success, or a failed dropdown on error. Restored history uses the same renderer. Codex availability remains controlled by its provider; the current harness enables generation for OpenAI models with a ChatGPT sign-in.

To inspect the UI without image-generation access, use the `chat/generatedImages` Component Explorer fixtures, including the Copilot/Codex selector in `Preview`. The rendering explorations remain under `chat/imageLoadingStudies`; they do not register tools or make image-generation requests.
