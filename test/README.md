# VS Code Tests

## Contents

This folder contains the various test runners for VS Code. Please refer to the documentation within for how to run them:

* `unit`: our suite of unit tests ([README](unit/README.md))
* `integration`: our suite of API tests ([README](integration/browser/README.md))
* `smoke`: our suite of automated UI tests ([README](smoke/README.md))
* `sanity`: release sanity tests ([README](sanity/README.md))

## Image generation in Agent Host

Copilot image generation is provided by its native runtime and observed by the Copilot Agent Host harness. It requires a compatible runtime/SDK and backend image-generation access. There is no local extension-host image generator.

The shared Chat renderer handles both Copilot's `image_generation` and Codex's `image_gen.imagegen` tool calls. Both show the binary-water placeholder and persistent progress while running, followed by an expandable input/output dropdown and a large image with a Save action on success, or a failed dropdown on error. Restored history uses the same renderer. Codex availability remains controlled by its provider; the current harness enables generation for OpenAI models with a ChatGPT sign-in.

To inspect the UI without image-generation access, use the `chat/generatedImages` Component Explorer fixtures, including the Copilot/Codex selector in `Preview`. The rendering explorations remain under `chat/imageLoadingStudies`; they do not register tools or make image-generation requests.

### Mock image generation in Copilot Agent Host

Source/development builds register `generate_image_mock` as an SDK client tool implemented entirely in VS Code's Copilot Agent Host. After rebuilding and restarting the Agent Host, open a Copilot harness chat or Agents-window session and ask:

```text
Use generate_image_mock with the prompt "Draw a happy puppy" to test image rendering.
```

The tool waits five seconds and returns the [bundled sample PNG](../src/vs/platform/agentHost/node/copilot/media/imageGenerationMock.png). It exercises the normal image-generation placeholder, persistent progress, prompt/output dropdown, large image, and Save action. Stop cancels the wait. Changing the prompt does not change the sample.

The mock does not call CAPI or an image provider, and needs no image-generation entitlement or custom runtime. Normal chat-model access is still required for the model to call the tool. It is absent from packaged builds and ephemeral sessions, does not replace the real `image_generation` tool, and does not restore the local extension-host implementation.

### Image reveal experiment

On this experiment branch, a single `generate_image_mock` image has one fixed width and top-left anchor from its loading indicator to its finished preview. The square bundled mock uses the same responsive size in every state (up to 400 px and 60% of viewport height). Its Save action and input/output disclosure sit below the image rather than changing its available width or pushing it down at completion. Galleries and real-provider rendering keep their existing layout.

Only the image's width is known while it generates, so every loader keeps a fixed height and works for as long as generation takes. Delayed image bytes leave the loader in place. Reduced motion and high-contrast themes show the loaded image immediately (loaders hold a still frame), and restored results do not replay the animation.

The mock preview has three families of reveals. Each continues one loader, and picking a reveal from another family switches to its loader; the **Loading** picker can still mix them.

**Line reveals** continue the **Comet** loader, a fine bright head with a long, fading tail. The line turns its right corner and traces the image's frame clockwise, opening the image space as it descends, and the image appears only after the frame closes. They take two seconds at normal speed.

- **Blue Scan**: a translucent blue veil and progressive blur sweep from left to right.
- **Frosted Scan**: a deeper blur clears with just a hint of blue.
- **Gentle Focus**: a quieter, low-blur dissolve.

**Dither reveals** continue the **Dither Wave** loader, a one-bit dithered wave sweeping a 40 px band of twinkling pixels. The band itself carries on into the reveal, with no traced line. Every stage after that is derived from the image: blocky 8 px dither, then 4 px and 2 px, then the image's own five-color palette, then its true colors, before the image takes over. They take about five seconds.

- **Dither Resolve**: the band opens into the frame while its wave speeds up and leaves, then a full-height wave sweeps across and develops the image in its tail.
- **Dither Print**: the band becomes a print head that moves down the frame and prints the image line by line; finer passes then sharpen it and bring in its colors.
- **Dither Bloom**: the image blooms out of the wave's head, and each ring that follows sharpens it or adds its colors.

**ASCII reveals** continue the **Glyph Wave** loader, a wave of denser glyphs sweeping a 50 px band of binary digits that drift with slow swells. Read as 8-bit ASCII from its left edge, every row of digits spells `HAPPY_CODING!`. The image is drawn in the same glyphs: dense glyphs where it is bright, faint digits where it is dark. The drawing then gets finer, takes on the image's palette, and then its true colors.

- **ASCII Resolve**: the band opens into the frame, and a full-height glyph wave draws the image.
- **ASCII Decode**: scrambled glyphs spread from the wave's head and lock into the glyph drawing, which decodes again at the finer size.

**Final configuration**: `chat/generatedImages/chatGeneratedImages/GlyphRevealFinal/Dark` (or Light) shows the treatment chosen to move forward with, without knobs. It uses **Glyph Wave** loading and **ASCII Resolve** in one pass, sweeping right, at medium density with 10 px glyphs. The 320 px loading band changes to the image's width first and then opens to its height, and the motion starts at 2× speed and settles to 1×. Its **Image** picker and **Upload Images...** work as in the other labs.

**Glyph lab (v2)** iterates on the glyph loaders and ASCII reveals, starting from the final configuration, at `chat/generatedImages/chatGeneratedImages/GlyphRevealV2/Dark` (or Light):

- **Loading**: **Glyph Wave**, or one of its alternatives. **Comets** race short streaks of glyphs along the band. **Bit Stream** shifts each row's bits along at its own tempo and lights every few bytes. **Ripples** spreads rings of glyphs from drops. **Typewriter** types the greeting out in binary behind a cursor, a line of whole bytes at a time. **Tide** rolls broad, soft swells of brighter digits through the band. Every loader keeps the greeting in its digits and carries on into either reveal.
- **Image Reveal** and **Passes**: ASCII Resolve can sweep up to six glyph waves. Each pass before the last draws the image in fewer levels and dimmer glyphs, and fills in more of it, so the drawing builds up before the image shows.
- **Direction**: the loader and the waves move right, left, down, up, diagonally, outward from the middle, or back and forth.
- **Density** sets how brightly the digits swell, and **Glyph Size** sets the cells from 6 to 12 px; the band holds whole rows, about 48 px.
- **Start Speed** and **End Speed**: the loader moves at the start speed, and the reveal eases to the end speed, for example starting at 2× and settling at 0.25×.
- **Loading Width**: the band has a fixed width while the image generates. Images keep their own size, as in the product (up to 512 px wide and 400 px tall), so when the reveal starts, the frame changes from the band's size to the image's. **Resize** picks whether it changes its width first, its height first, or both together. The **Portrait** and **Panorama** images show both.

The **Speed** picker scales every loading and reveal motion: 0.5× plays everything twice as long, and 0.25× four times as long for close inspection. The **Image** picker previews the bundled sample, a generated landscape with bold shapes, or your own images: **Upload Images...** adds PNG, JPEG, GIF, or WebP files from disk, and each upload stays selectable until the page reloads.

For UI iteration without model access, use the repository's Node version and start Component Explorer:

```sh
npm run transpile-client
npm run serve-out-rspack
```

At the server's printed URL, select `chat/generatedImages/chatGeneratedImages/CometReveal/Dark` (or its Light variant), or `GlyphRevealFinal` for the final configuration and `GlyphRevealV2` for the glyph lab. Choose a reveal, loader, speed, and image, then choose **Complete Generation** to run it and **Restart Preview** to replay it. Every choice resets the preview and keeps the others. All pickers support arrow keys and include descriptions. The fixture includes narrow, reduced-motion, high-contrast, and delayed referenced-image cases. With `source: Referenced`, **Load Image** releases the bytes independently of tool completion. No model call or image-generation entitlement is required.

If hot reload reports a duplicate workbench command registration after a TypeScript edit, reload the browser page. **Restart Preview** replays the treatment; it does not reset process-wide registrations.
