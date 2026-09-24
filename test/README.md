# VS Code Tests

## Contents

This folder contains the various test runners for VS Code. Please refer to the documentation within for how to run them:

* `unit`: our suite of unit tests ([README](unit/README.md))
* `integration`: our suite of API tests ([README](integration/browser/README.md))
* `smoke`: our suite of automated UI tests ([README](smoke/README.md))
* `sanity`: release sanity tests ([README](sanity/README.md))

## Mock image generation in local Chat

Source/development builds register the client-side `generate_image_mock` tool. In local Chat's Agent mode, attach `#generate_image_mock` and ask it to simulate generating an image, for example: `#generate_image_mock Draw a happy puppy`.

The tool waits five seconds, showing the normal image-generation waves and persistent progress, then returns the [bundled sample image](../src/vs/workbench/contrib/chat/common/tools/builtinTools/media/generatedImageMock.png). The prompt and output remain available in the completed tool dropdown, with the large image and Save action below it. Stop cancels the wait.

The prompt does not change the sample image. The mock does not contact an image-generation service or write workspace files, and it does not require image-generation entitlement, the image preview flag, or a custom SDK/runtime. Normal chat model access is still needed for a model to call the tool. The real `generate_image` tool is unchanged. This mock is not registered in packaged builds and is hidden when Chat is disabled.
