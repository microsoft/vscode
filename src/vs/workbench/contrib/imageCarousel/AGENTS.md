# Image Carousel

A generic workbench editor for viewing collections of images in a carousel/slideshow UI. Opens as a modal editor pane with navigation arrows, a caption, and a thumbnail strip.

## Architecture

The image carousel is a self-contained workbench contribution that follows the **custom editor** pattern:

- **URI scheme**: `vscode-image-carousel` (registered in `Schemas` in `src/vs/base/common/network.ts`) — used for `EditorInput.resource` identity.
- **Direct editor input**: Callers create `ImageCarouselEditorInput` with a collection and open it directly via `IEditorService.openEditor()`.
- **Image extraction**: `IImageCarouselService.extractImagesFromResponse()` extracts images from chat response tool invocations into a **sections-based** collection. All images from a single response are grouped into one section. The collection title is the user's chat request message. Each image caption is derived from the tool's `pastTenseMessage` (preferred) or `invocationMessage`.

## How to open the carousel

### From code (generic)

```ts
const collection: IImageCarouselCollection = { id, title, sections: [{ title: '', images: [...] }] };
const input = new ImageCarouselEditorInput(collection, startIndex);
await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
```

### From chat (via click handler)

Clicking an image attachment pill in chat (when `chat.imageCarousel.enabled` is true) executes the `workbench.action.chat.openImageInCarousel` command, which extracts all images from the chat response and opens them in the carousel. MIME types are resolved via `getMediaMime()` from `src/vs/base/common/mime.ts`.

## Key design decisions

### Editor & lifecycle

- **Modal editor**: Opens in `MODAL_GROUP` (-4) as an overlay.
- **Not restorable**: `canSerialize()` returns `false` — image data is in-memory only.
- **Collection ID = chat response identity**: `sessionResource + '_' + responseId` for stable dedup via `EditorInput.matches()`.
- **Preview-gated**: `chat.imageCarousel.enabled` (default `false`, tagged `preview`). When off, clicks fall through to `openResource()`.
- **Exact image matching**: Scans responses in reverse, only opens a collection if the clicked image bytes are found in it (`findIndex` + `VSBuffer.equals`).

### DOM & rendering

- **DOM construction**: Uses the `h()` helper from `vs/base/browser/dom` with `@name` references for declarative DOM — no imperative `document.createElement` calls.
- **Bottom bar**: Caption and thumbnail sections are wrapped in a `div.bottom-bar` flex column below the image area.
- **Stable DOM skeleton**: Builds DOM once per `setInput()`, updates only changing parts to avoid flash on navigation.
- **Blob URL lifecycle**: Main image URLs tracked in `_imageDisposables` (revoked on nav), thumbnails in `_contentDisposables` (revoked on `clearInput()`).
- **Focus border suppressed**: The slideshow container uses `outline: none !important` on `:focus` / `:focus-visible` to override the workbench's global `[tabindex="0"]` focus styles.

### Keyboard & focus

- **Keyboard parity**: Uses `registerOpenEditorListeners` (click, double-click, Enter, Space) matching other attachment widgets.
- **Arrow key navigation**: Handled via DOM `keydown` listener with `stopPropagation()` — not Action2 keybindings, because the modal editor's `KEY_DOWN` handler blocks `workbench.*` commands not in its allowlist. The editor overrides `focus()` to forward focus to the slideshow container so arrow keys work immediately without clicking.
