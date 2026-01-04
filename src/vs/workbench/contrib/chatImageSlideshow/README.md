# Chat Image Slideshow

This feature allows you to view multiple images returned by MCP tools or chat responses in a dedicated slideshow editor.

## Usage

1. When a chat response contains images (typically from MCP tool results), you can open them in a slideshow view
2. Run the command "Open Images in Slideshow" from the command palette (F1)
3. The slideshow will open in a new editor tab showing all images from the last chat response

## Features

- **Navigation**: Use Previous/Next buttons to navigate through images
- **Thumbnails**: Click on thumbnails at the bottom to jump to specific images
- **Image Counter**: Shows current image position (e.g., "2 / 5")
- **Clean UI**: Images are displayed with a clean, centered layout optimized for viewing

## Keyboard Shortcuts

(To be implemented)
- Arrow Left/Right: Navigate between images
- Home/End: Jump to first/last image
- Escape: Close the slideshow

## Technical Details

### Architecture

The feature consists of several components:

1. **Service** (`ChatImageSlideshowService`): Extracts images from chat responses
2. **Editor Input** (`ChatImageSlideshowEditorInput`): Represents a slideshow document
3. **Editor Pane** (`ChatImageSlideshowEditor`): Renders the slideshow UI
4. **Types** (`chatImageSlideshowTypes.ts`): Type definitions for images and collections

### Image Extraction

Images are extracted from `IToolResultDataPart` entries in tool invocation results. The service:
- Iterates through chat response items
- Finds tool invocations with completed or waiting-for-approval state
- Extracts data parts with `mimeType` starting with "image/"
- Creates a collection with metadata (id, name, source)

### Rendering

The editor uses standard DOM elements:
- Main image area with object-fit: contain
- Navigation controls with Previous/Next buttons
- Thumbnail strip for quick navigation
- All using VS Code theme colors and styling

## Future Enhancements

- Zoom and pan controls for large images
- Fullscreen mode
- Export/save individual images
- Slide show auto-play mode
- Context menu on chat response items to directly open slideshow
- Support for video content in addition to images
