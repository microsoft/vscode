# Implementation Plan: Update Chat Todo List Widget Title with Progress Indicator

## Executive Summary
Update the VS Code chat todo list widget to change "Tasks" to "Todos" and add a UX-friendly progress indicator showing completion status (e.g., "Todos (2/5)").

## Codebase Analysis

### Structure
- `/src/vs/workbench/contrib/chat/browser/chatContentParts/chatTodoListWidget.ts`: Main widget implementation
- `/src/vs/workbench/contrib/chat/common/chatTodoListService.ts`: Todo service and storage interface
- `/src/vs/nls.js`: Localization framework used throughout VS Code

### Key Entry Point
- `/src/vs/workbench/contrib/chat/browser/chatContentParts/chatTodoListWidget.ts:48` — Initial title setup
- `/src/vs/workbench/contrib/chat/browser/chatContentParts/chatTodoListWidget.ts:103` — Title update in renderTodoList

### Patterns Found
- **Localization**: `localize('chat.todoList.title', 'Tasks')` — VS Code standard pattern
- **DOM manipulation**: Uses `dom.$` helper for element creation
- **Progress tracking**: Widget already has access to todo status via `IChatTodo.status`
- **Dynamic updates**: `renderTodoList()` method regenerates display when data changes

## Implementation Strategy
Modify the existing `ChatTodoListWidget` to calculate completion progress and update the title text to include a progress indicator. Use VS Code's localization system to maintain internationalization support.

### Technical Specs
- Entry: `/src/vs/workbench/contrib/chat/browser/chatContentParts/chatTodoListWidget.ts:103`
- Modify: `renderTodoList()` method — Add progress calculation logic
- Modify: Line 48 — Update initial title for consistency
- Modify: Line 103 — Replace static title with dynamic progress-aware title
- Pattern: Follow VS Code localization using `localize()` function
- Test: Manual verification through chat interface

## Tasks

- [x] TASK-1: Add progress calculation helper method — FEAT-PROGRESS — S — [no deps]
  - Scope: Create `getProgressText()` method that calculates completed vs total todos
  - Resources: `/src/vs/workbench/contrib/chat/browser/chatContentParts/chatTodoListWidget.ts`
  - Accept: Method returns formatted string like "Todos (2/5)" or "Todos" when empty
  - Status: ✅ COMPLETE

- [x] TASK-2: Update localization keys — FEAT-LOCALIZATION — S — [TASK-1]
  - Scope: Update localize calls to use new key and support progress formatting
  - Resources: Update both line 48 and 103 localize calls
  - Accept: Both title locations use consistent localization pattern
  - Status: ✅ COMPLETE

- [x] TASK-3: Integrate progress display in renderTodoList — FEAT-DISPLAY — M — [TASK-1, TASK-2]
  - Scope: Modify renderTodoList to call progress helper and update title element
  - Resources: Lines 100-105 in chatTodoListWidget.ts
  - Accept: Title dynamically shows "Todos (X/Y)" based on completion status
  - Status: ✅ COMPLETE

- [x] TASK-4: Update CSS styling for less prominent header — FEAT-STYLING — S — [TASK-3]
  - Scope: Reduce font size, use muted color, reduce spacing for compact appearance
  - Resources: `/src/vs/workbench/contrib/chat/browser/media/chat.css` (lines 2367-2410)
  - Accept: Header uses smaller font, muted color, and reduced margins for less prominence
  - Status: ✅ COMPLETE

- [x] TASK-5: Implement scrolling with UX improvements — FEAT-SCROLL — M — [TASK-4]
  - Scope: Add max height with scroll, half-line affordance, auto-scroll to active items, scroll snap
  - Resources: CSS updates and new `scrollToRelevantItem()` method in chatTodoListWidget.ts
  - Accept: List scrolls at 6.5 items, shows active items, smooth scroll behavior
  - Status: ✅ COMPLETE

- [x] TASK-6: Improve max-height calculation with calc() — FEAT-RESPONSIVE — S — [TASK-5]
  - Scope: Replace hard-coded pixels with VS Code-standard calc() approach
  - Resources: CSS max-height calculation and dynamic item height in TypeScript
  - Accept: Uses calc(6.5 * 24px) pattern and dynamic item height calculation
  - Status: ✅ COMPLETE

## Implementation Results

### Changes Made
1. **Added `getProgressText()` method** (lines 147-155):
   - Calculates completed vs total todos
   - Returns "Todos" when empty, "Todos (X/Y)" when populated
   - Uses proper VS Code localization patterns

2. **Updated initial title setup** (line 48):
   - Changed from `localize('chat.todoList.title', 'Tasks')`
   - To `localize('chat.todoList.title', 'Todos')`

3. **Updated renderTodoList method** (line 103):
   - Replaced static title text with dynamic `this.getProgressText(todoList)`
   - Now shows real-time progress as todos are completed

4. **Updated CSS styling for less prominent header** (chat.css lines 2367-2410):
   - **Font size**: Reduced title from default to 12px
   - **Font weight**: Changed from 600 (semibold) to normal
   - **Color**: Changed from `--vscode-foreground` to `--vscode-descriptionForeground` (muted)
   - **Icon size**: Reduced expand icon from default to 12px
   - **Spacing**: Reduced widget padding from 8px to 4px-6px
   - **Gaps**: Reduced element gaps from 6px to 4px
   - **Container margins**: Reduced left padding from 20px to 16px, top margin from 4px to 2px

5. **Implemented scrolling with advanced UX** (CSS + new TypeScript method):
   - **Max height**: Uses `calc(6.5 * 24px)` following VS Code patterns instead of hard-coded 156px
   - **Scroll behavior**: Smooth scrolling with modern CSS
   - **Scroll snap**: Proximity-based snapping for natural feel
   - **Auto-scroll**: Automatically scrolls to last in-progress or completed item
   - **Smart positioning**: Centers active items in view, handles edge cases
   - **Consistent item height**: 24px minimum for reliable scroll snap behavior

6. **Improved responsive sizing** (CSS + TypeScript enhancements):
   - **Dynamic calculation**: Uses `calc(6.5 * 24px)` pattern matching VS Code QuickInput
   - **Runtime flexibility**: TypeScript calculates item height dynamically from DOM
   - **Maintainable**: Clear intent with 6.5 items × item height formula
   - **VS Code consistency**: Follows established patterns from platform/quickinput

### Verification
- ✅ Compilation successful (0 errors)
- ✅ TypeScript validation passed
- ✅ VS Code localization patterns followed
- ✅ Maintains existing widget functionality
- ✅ CSS styling updated for less prominent, compact header

### Behavior
- **Empty state**: Shows "Todos" in smaller, muted text
- **With todos**: Shows "Todos (2/5)" format indicating completion progress
- **Real-time updates**: Progress updates automatically as todo status changes
- **Visual styling**: Header now uses 12px font, normal weight, muted color, and reduced spacing for less prominence
- **Scrolling UX**:
  - Shows 6.5 items with half-line affordance when more exist
  - Auto-scrolls to highlight last active (in-progress/completed) item
  - Smooth scroll behavior with subtle snap-to-item alignment
  - Modern, VS Code-styled scrollbars
- ✅ Maintains existing widget functionality

### Behavior
- **Empty state**: Shows "Todos"
- **With todos**: Shows "Todos (2/5)" format indicating completion progress
- **Real-time updates**: Progress updates automatically as todo status changes

## Component Map
- `getProgressText(todoList: IChatTodo[])`: creates progress indicator text
- `renderTodoList()`: modifies to use dynamic title with progress
- `createChatTodoWidget()`: modifies initial title setup for consistency

## API Changes
No external API changes - internal widget implementation only.

## Decisions
- 2025-08-05: Use "Todos" instead of "Tasks" — More common terminology for checklist items
- 2025-08-05: Format as "(X/Y)" — Matches VS Code's existing progress patterns (e.g., search results)
- 2025-08-05: Show progress only when todos exist — Cleaner UX when list is empty

## Open Questions
- **Localization**: A) Use single localize key with interpolation vs B) Separate keys for with/without progress — recommend A because it's simpler to maintain
- **Progress format**: A) "(2/5)" vs B) "(2 of 5)" vs C) "2/5" — recommend A because it matches VS Code patterns
- **Empty state**: A) Show "Todos (0/0)" vs B) Show just "Todos" — recommend B because 0/0 is confusing

**PAUSE FOR FEEDBACK**

---

## Implementation Updates

### 6. Optimize scrollIntoView to show more completed items ✅

**Enhancement**: Improved scroll positioning logic to show more completed items above the active item, with special handling for when nothing is completed.

**Changes Made**:
- Updated `scrollToRelevantItem()` method to track both last active item and first completed item
- Added smart scroll positioning logic:
  - **When no items are completed**: Scrolls to the top to show the beginning of the list
  - **When there are completed items**: If the last active item is far down, scroll to the first completed item instead
  - This provides better context by showing the progression of completed work
  - Uses `block: 'start'` positioning to maximize visibility of completed items above
- Enhanced the method signature to accept `firstCompletedIndex` parameter for smarter positioning decisions

**Technical Details**:
- Added `firstCompletedIndex` tracking in the render loop
- Implemented early return with `scrollTo({ top: 0, behavior: 'smooth' })` when no completed items exist
- Added logic to choose between showing the first completed item vs. the last active item
- Used `block: 'start'` for optimal positioning when showing completed context
- Follows VS Code's scroll behavior patterns found in notebook renderers

**Result**: Users can now see more of their completed todos when scrolling, or see the beginning of the list when nothing is completed yet, providing better context and sense of progress.

### 7. Add scroll snap padding for half-visible affordance ✅

**Enhancement**: Added scroll padding to the todo list container to ensure the next/previous items are half-visible during scroll snap.

**Changes Made**:
- Added `scroll-padding-top: 12px` to `.chat-todo-list-widget .todo-list-container`
- Added `scroll-padding-bottom: 12px` to `.chat-todo-list-widget .todo-list-container`
- This works with the existing `scroll-snap-type: y proximity` and `scroll-snap-align: start` properties

**Technical Details**:
- 12px padding = half of the 24px item height, providing perfect half-item visibility
- Uses CSS scroll-padding which works with native scroll snap behavior
- Maintains smooth scrolling while providing clear visual affordance that more content is available
- Follows accessibility guidelines for indicating scrollable content

**Result**: When users scroll through the todo list, they can always see partial items above and below, providing clear visual indication that more content is available and improving the overall scrolling experience.
