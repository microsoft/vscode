# Sculpt-n-Code Memory Bank

## Project Overview

Sculpt-n-Code is a VS Code extension that provides runtime visualization of Python code. It allows users to see the values of variables as they change during execution, displayed directly next to the code in the editor.

## Architecture

The project consists of three main components:

1. **Frontend (Editor Integration)**
   - Located at: `src/vs/editor/contrib/snc/browser/snc.ts`
   - Implements a VS Code editor contribution that displays visualization widgets
   - Uses content widgets to show HTML representations of runtime values
   - Debounces code execution to avoid running on every keystroke

2. **Backend Service**
   - Located at: `src/vs/platform/snc/node/sncProcessService.ts`
   - Executes Python code using a custom runner script
   - Parses visualization data from the runner's output
   - Returns both standard output/error and visualization data

3. **Python Runner**
   - Located at: `src/vs/platform/snc/node/python_runner.py`
   - **Updated to use source-to-source translation instead of runtime tracing**
   - Uses Python's AST module to parse and transform user code
   - Injects logging statements for:
     - Assignment RHS values (e.g., `x = 5` logs `5`)
     - Conditional scrutinees (e.g., `if x > 5:` logs `True/False`)
     - For loop iteration variables (e.g., `for i in range(3):` logs `0, 1, 2`)
   - Generates transformed code with embedded logging calls
   - Executes transformed code to capture visualization data
   - Outputs JSON-formatted visualization data

## Data Flow

1. User types code in the editor
2. Frontend debounces and sends code to backend
3. Backend executes code using the Python runner
4. Python runner captures runtime values and outputs JSON
5. Backend parses JSON and returns visualization data
6. Frontend displays visualization widgets next to code lines

## Interface Definitions

- `IVisualizationItem`: Represents a single visualization item with line number, execution step, HTML content, and optional loop context
- `IProcessResult`: Includes standard process output and visualization data

## Source-to-Source Translation Details

The Python runner now uses AST (Abstract Syntax Tree) transformation instead of runtime tracing:

### CodeTransformer Class
- Inherits from `ast.NodeTransformer`
- Transforms specific AST nodes to inject logging
- Uses temporary variables to avoid side effects
- **NEW**: Tracks loop context using `loop_context_stack`

### Transformation Strategy
- **Assignments**: `x = 5` becomes `_temp_1 = 5; x = _temp_1; _log_value(1, _temp_1)`
- **Conditionals**: `if x > 5:` becomes `_temp_2 = x > 5; _log_conditional(2, _temp_2); if _temp_2:`
- **For loops**: Injects `_log_value(line, iter_var, loop_end_line)` at the beginning of loop body

## Implementation Status

- [x] Frontend automatically runs when user types code
- [x] Python runner implemented with source-to-source translation
- [x] Runtime values captured and converted to HTML
- [x] JSON output format implemented
- [x] Frontend displays HTML content at the end of code lines
- [x] AST transformation for assignments, conditionals, and for loops
- [x] Error visualization entries for runtime errors
- [x] Working directory support for Python execution
- [x] **Simplified Python runner with unified log_value function** (June 5, 2025)
- [x] **Cursor-based loop visualization** (January 17, 2025)
- [x] **Content-aware positioning system for tall/wide visualizations** (August 6, 2025)

### Content-Aware Positioning System (NEW)

**COMPLETED**: Added intelligent positioning system that automatically moves tall/wide visualizations between lines instead of always placing them at line ends (August 6, 2025)

#### Problem Solved
- Previously, all visualizations appeared inline at the end of lines, regardless of size
- Tall or wide visualizations (pandas DataFrames, multi-line Series, large numpy arrays) would overlap following lines
- Limited readability for complex data structures

#### Implementation Details

**Technical Implementation**:
- **ViewZones**: Uses VS Code's ViewZone API to create actual vertical space between lines

### Cursor-Based Loop Visualization

**COMPLETED**: Added cursor-based loop visualization that shows different iteration values based on cursor position (January 17, 2025)

#### Problem Solved
- Previously, loop visualizations always showed the last iteration values
- Users wanted to see first iteration values when cursor is before/in a loop
- Needed dynamic switching between first and last iteration based on cursor position

#### Implementation Details

**Interface Changes** (`src/vs/platform/snc/common/snc.ts`):
- Added `last_line_in_containing_loop?: number` field to `IVisualizationItem`
- This field contains the last line number of the loop containing the visualization

**Python Runner Changes** (`src/vs/platform/snc/node/python_runner.py`):
- **Loop Context Tracking**: Added `loop_context_stack` to track nested loop contexts
- **Helper Methods**:
  - `_get_current_loop_end_line()`: Returns end line of current loop
  - `_calculate_loop_end_line()`: Calculates end line from loop body statements
- **Enhanced Logging**: `log_value()` now accepts `last_line_in_containing_loop` parameter
- **AST Transformation**: `visit_For()` uses try/finally to properly track loop context
- **Log Call Generation**: `_create_log_call_with_loop_context()` includes loop context in generated calls

**Frontend Changes** (`src/vs/editor/contrib/snc/browser/snc.ts`):
- **Cursor Position Tracking**: Added `onDidChangeCursorPosition()` listener
- **Smart Visualization Selection**: `updateVisualizationWidgets()` now:
  - Groups visualization items by line number
  - Checks if cursor is before/in any loop containing each line
  - Selects first iteration (min execution_step) if cursor ≤ loop end line
  - Selects last iteration (max execution_step) if cursor > loop end line
- **Responsive Updates**: Visualizations update when cursor moves (with debouncing)

#### Behavior
- **Cursor before/in loop**: Shows values from first iteration
- **Cursor after loop**: Shows values from last iteration (original behavior)
- **Independent evaluation**: Each loop evaluated independently for nested loops
- **Real-time updates**: Changes as user moves cursor around the code

#### Technical Implementation
- Uses simplified approach: embed loop context in visualization data
- Frontend makes cursor-based decisions without parsing code
- Maintains backward compatibility with existing non-loop visualizations
- Efficient: minimal re-computation when cursor moves

### Window Screenshot Implementation
- **Solution**: Uses AppleScript to get window position/size: `get {position, size} of first window`
- **Region Capture**: `screencapture -R x,y,width,height` for precise window targeting
- **Multi-Monitor Support**: Works perfectly regardless of which monitor VS Code is on
- **Reliable**: More robust than window ID approach which fails with Electron apps
- **Precise**: Captures only the VS Code window content, no desktop/other apps

### Debugging Process
- Window ID retrieval failed because System Events window IDs ≠ screencapture window server IDs
- AppleScript error -1728: "Can't get id" indicated incompatible ID systems
- Region-based approach using position/size coordinates is the reliable solution
- Tested and confirmed working with actual VS Code window capture

## Custom HTML Visualizer System

**COMPLETED**: Added pluggable HTML visualizer system for custom data type representations (January 8, 2025)

### Problem Solved
- Previously, all data types used the same `repr()` + `html.escape()` approach for visualization
- Users wanted custom HTML representations for different data types (lists, dicts, etc.)
- Needed extensible system where users could add their own visualizers

### Architecture Implementation

**File-Based Discovery System**:
- **Search Paths** (in priority order):
  1. `.snc/` (project-specific visualizers)
  2. `~/.snc/` (user-global visualizers)
  3. `<python_runner_dir>/visualizers/` (built-in system visualizers)

**Visualizer Interface**:
- Each visualizer file must contain:
  - `can_visualize(value) -> bool`: Check if visualizer can handle the value
  - `visualize(value) -> str`: Generate HTML representation
- Files are discovered via `glob.glob('*.py')` in search directories
- First visualizer that returns `True` from `can_visualize()` is used
- Fallback: If no custom visualizer found or custom visualizer fails, falls back to original `repr()` approach

### Built-in Visualizers Created
1. **List Visualizer** (`list_visualizer.py`):
2. **Dictionary Visualizer** (`dict_visualizer.py`):
3. **String Visualizer** (`string_visualizer.py`):
4. **NumPy Array Visualizer** (`numpy_visualizer.py`):
5. **Pandas Visualizer** (`pandas_visualizer.py`):
   - **DataFrames**
   - **Series**

## Interaction Model (Event-Driven UI State) — August 22, 2025

- Frontend emits a single UiEvent per interaction; no JS-side model state is persisted.
- Renderer sends uiEventJson (JSON.stringify(event)) through IProcessOptions.
- Node service sets SNC_UI_EVENTS environment variable when uiEventsJson is present.
- Python runner reads SNC_UI_EVENTS once per run and treats it as a list of UI events.
- Visualizers define init_model(), update(event, model), and visualize(value, model):
  - Runner flow per logged item: model = init_model(); if event.line == item.line then model = update(event, model); html = visualize(value, model) with graceful fallback to visualize(value) for legacy visualizers.
- Rerun policy: immediate rerun on UI event; event-only payload keeps transport minimal.
- Backward compatibility: visualizers without model/update remain supported.
- Deprecations to remove: SNC_UI_STATE, JS-side uiState accumulation in the renderer.

## TODOs and Future Improvements

- [x] **Custom HTML visualizer system with pluggable architecture**
- [x] **Add NumPy array visualizer with shape/dtype information**
- [x] **Add Pandas DataFrame visualizer with HTML table representation**
- [ ] Create visualizer for custom classes with attribute inspection
- [x] Fix Trusted Types security issue with innerHTML assignment
- [x] Move live values from top of lines to right end of lines
- [x] **Cursor-based loop visualization for first/last iteration switching**

## Security Considerations

- The project now uses VS Code's Trusted Types policy to safely assign HTML content to innerHTML
- Implemented using `createTrustedTypesPolicy('sncVisualization', { createHTML: value => value })`
- HTML content from the Python runner is already escaped using html.escape() in the Python runner
- Uses the 'sncVisualization' policy name which we added to VS Code's allowlist

## ES Modules Support

The project uses ES modules (indicated by `.js` extension in imports). When working with file paths in ES modules:

- `__dirname` and `__filename` are not available in ES modules
- Use `import.meta.url` and `fileURLToPath` from the `node:url` module instead:

```typescript
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

This pattern is implemented in `src/vs/platform/snc/node/sncProcessService.ts` to correctly resolve the path to the Python runner script.

## Error Visualization

The Python runner now provides inline error visualization when runtime errors occur:

### Error Handling Process
1. **Error Detection**: When Python code execution fails, the `except` block in `run_with_visualization()` catches the exception
2. **Error Line Extraction**: `extract_error_line_from_traceback()` parses the traceback to find the line number where the error occurred
3. **Error Visualization**: `log_error()` creates a styled visualization entry with red background and error icon
4. **JSON Output**: Error entries are included in the visualization data alongside normal value entries

### Error Types Supported
- **NameError**: Undefined variables (e.g., `x = y` when `y` doesn't exist)
- **TypeError**: Type-related errors (e.g., `'str' + 5`)
- **ValueError**: Invalid values (e.g., `int('abc')`)
- **IndexError**: List/string index out of range
- **All Python Exceptions**: The system handles any Python exception type

### Error Visualization Format
- **Styling**: Red color (`#ff6b6b`) with semi-transparent red background
- **Icon**: Red X emoji (❌) to clearly indicate errors
- **Content**: Error type and message (e.g., "❌ NameError: name 'z' is not defined")
- **Positioning**: Appears as inline widget next to the problematic line

### Line Number Mapping
- Parses traceback strings to find `File "<string>"` entries (user code executed via `exec()`)
- Adjusts line numbers to account for AST transformation overhead
- Falls back to reasonable defaults if parsing fails
- Handles both simple and complex error scenarios

## Debugging and Logging

### Process Architecture
The SNC system uses VS Code's IPC architecture:
- **Frontend (Renderer Process)**: `src/vs/editor/contrib/snc/browser/snc.ts` - runs in the browser/renderer process
- **Backend (Main Process)**: `src/vs/platform/snc/node/sncProcessService.ts` - runs in Electron's main process
- **Python Runner**: `src/vs/platform/snc/node/python_runner.py` - spawned as child process

### Service Registration
The SNC service is registered in `src/vs/code/electron-main/app.ts`:
- Service: `services.set(ISNCProcessService, new SyncDescriptor(SNCProcessService, undefined, true));`
- Channel: `mainProcessElectronServer.registerChannel('sncProcess', sncProcessChannel);`

## Working Directory Support

The system now supports executing Python code in the correct working directory:

### Implementation Details
1. **Frontend**: Gets working directory from first workspace folder using `workspaceContextService.getWorkspace().folders[0]?.uri.fsPath`
2. **Interface**: `IProcessOptions` now requires `workingDirectory` parameter
3. **Backend**: Passes working directory as first argument to Python runner
4. **Python Runner**: Uses `os.chdir()` to change to specified directory before executing code

### Command Line Arguments
- `python python_runner.py <working_directory> [code]`

## Direct IPC via stdio JSON

Replaced the auxiliary file system with direct IPC between Node and the Python runner using a single JSON message over stdout. This keeps user program stdout/stderr intact while eliminating disk I/O.

### Implementation Details

#### Backend Service (`sncProcessService.ts`)
1. Spawns the Python runner with only the working directory argument: `python python_runner.py <working_directory>`
2. Sends the Python source code to the runner via stdin
3. Reads one JSON object from the runner’s stdout and parses:
   - `stdout`: captured user program standard output
   - `stderr`: captured user program standard error (including any traceback)
   - `visualizationData`: array of visualization items
   - `exitCode`: 0 on success, 1 on exception during execution
4. No temporary files are created or read

#### Python Runner (`python_runner.py`)
1. Reads code from stdin; expects only `<working_directory>` as argv
2. Uses `contextlib.redirect_stdout/redirect_stderr` and `io.StringIO` to capture user program output while executing the transformed AST
3. On completion or error, emits a single JSON object to stdout:
   ```
   {
     "stdout": string,
     "stderr": string,
     "visualizationData": IVisualizationItem[],
     "exitCode": number
   }
   ```
4. Continues to log error visualizations via `log_value()` and writes traceback text into the captured `stderr`

### Command Line Arguments
- Now: `python python_runner.py <working_directory>` with program code provided on stdin

### Error Handling
- Exceptions during user code execution:
  - Produce an inline error visualization (line-mapped) via `log_value`
  - Include full traceback text in the `stderr` field of the JSON
- Runner-level errors (e.g., invalid working directory) are written to the process’ own stderr; the Node side appends this to the returned `stderr` for visibility
- Design principle maintained: do not hide errors; ensure they remain visible for debugging

## Streaming Visualization (NDJSON over stdout) — August 18, 2025

Implemented incremental streaming of visualization items so values appear while the Python program is running.

Design
- Transport: NDJSON over the Python runner stdout
  - Per-item line: {"type":"item","item": IVisualizationItem}
  - Final line: {"type":"result","result": IProcessResult}
- Python runner (src/vs/platform/snc/node/python_runner.py)
  - Introduced _stream_out TextIO: prefer sys.__stdout__ if available, else sys.stdout
  - log_value now writes a streaming item line and flushes immediately
  - At program end, writes a single final "result" line and flushes
  - Kept existing redirected stdout/stderr capture for user program output
- Node service (src/vs/platform/snc/node/sncProcessService.ts)
  - Added onStream: Event<SNCStreamMessage> and startProgram(content, options, runId), cancel(runId)
  - Maintains a Map of runId → { child, buffer, stderr, timeoutId, ended }
  - Parses child.stdout by lines; emits 'item' and 'end' messages to onStream
  - cancel(runId) kills child and cleans up
  - runProgram still supported; augmented to parse the last NDJSON "result" as fallback
- Common API (src/vs/platform/snc/common/snc.ts)
  - New SNCStreamMessage union type
  - ISNCProcessService now exposes:
    - onStream: Event<SNCStreamMessage>
    - startProgram(content, options, runId): Promise<void>
    - cancel(runId): Promise<void>
  - Kept runProgram for compatibility
- Renderer (src/vs/editor/contrib/snc/browser/snc.ts)
  - Subscribes once to channel.listen('onStream') and filters events by currentRunId
  - On 'item': push to accumulated list and throttle UI updates (~50ms)
  - On 'end': final UI update; log stdout/stderr; clear currentRunId
  - Cancels previous runId on each edit before starting a new one; clears widgets
  - Reuses existing updateVisualizationWidgets logic for incremental data

Testing
- Added a sleep-based loop to snc_test.py to demonstrate visible streaming:
  for i in range(12):
      streamed_val = i * i
      streamed_dict = {"i": i, "square": streamed_val}
      time.sleep(0.25)
- Run the app via ./scripts/code.sh . ./snc_test.py and observe values appear progressively next to the streamed assignment lines.

## CRITICAL TESTING NOTE

**IMPORTANT**: When testing visualization changes, you must:
1. **Look closely for actual runtime values** displayed to the right of code lines
2. **Have Python code that actually executes** and generates visualizations
3. **Verify the extension is actively running and processing code**
4. Simply seeing VS Code open is NOT sufficient - there must be visible runtime values

Do NOT assume visualizations are working just because VS Code is open. The visualization values must be actually visible on screen for any color/styling changes to be verified.

## Window Visibility Trigger Implementation

**COMPLETED**: Added window focus/visibility trigger for visualizations (December 4, 2025)

### Problem Solved
- Visualizations previously only updated on keydown events
- Needed to also update when window becomes visible to satisfy CRITICAL TESTING NOTE
- Users switching back to VS Code would see stale visualizations

### Implementation Details
- **File Modified**: `src/vs/editor/contrib/snc/browser/snc.ts`
- **Service Added**: `IHostService` dependency injection for window focus events
- **Event Handler**: `hostService.onDidChangeFocus(focused => { if (focused) this.onWindowBecameVisible(); })`
- **Method Added**: `onWindowBecameVisible()` that triggers the same debounced `runProgram()` call
- **Behavior**: Reuses existing visualization update logic with same debouncing and error handling

## AST Compilation Error Fix

**COMPLETED**: Fixed AST compilation error "AST node line range (3, 1) is not valid" (June 5, 2025)

### Problem Description
- Python AST compiler was rejecting transformed AST nodes with invalid line ranges
- Error occurred when `end_lineno` was less than `lineno` (e.g., `end_lineno=1, lineno=3`)
- Caused by AST transformation methods not properly copying line range information

### Root Cause
- `visit_For`, `visit_While`, and `visit_If` methods in `CodeTransformer` class were missing `end_lineno` and `end_col_offset` attributes
- Original AST nodes had valid line ranges, but transformed nodes did not preserve them
- `ast.fix_missing_locations()` could not properly handle missing line range information

### Solution Implementation
**File Modified**: `src/vs/platform/snc/node/python_runner.py`

**Changes Made**:
1. **Fixed `visit_For` method**: Added `end_lineno` and `end_col_offset` parameters to returned `ast.For` node
2. **Fixed `visit_While` method**: Added `end_lineno` and `end_col_offset` parameters to returned `ast.While` node
3. **Fixed `visit_If` method**: Already had the fix (was included in earlier transformation updates)

**Code Pattern**:
```python
return ast.For(
    # ... other parameters ...
    end_lineno=node.end_lineno if hasattr(node, 'end_lineno') else node.lineno,
    end_col_offset=node.end_col_offset if hasattr(node, 'end_col_offset') else node.col_offset + 10
)
```

## Python Runner Simplification

**COMPLETED**: Simplified Python runner logging system (June 5, 2025)

### Problem
- Had multiple specific logging functions (`log_assignment`, `log_conditional`, `log_iteration`, `log_error`)
- Each function added type-specific prefixes ("value:", "condition:", "iter:")
- Used div wrappers around HTML content
- More complex than needed for unified visualization

### Solution
1. **Unified Logging**: Replaced all specific functions with single `log_value(line: int, value: Any)` function
2. **Raw Output**: Removed type prefixes and div wrappers - just HTML-escaped `repr(value)`
3. **AST Updates**: Changed all transformer calls to use `_log_value` instead of specific functions
4. **Error Handling**: Errors now logged using same `log_value` function with formatted error string

### Implementation Details
- **Removed functions**: `log_assignment()`, `log_conditional()`, `log_iteration()`, `log_error()`
- **Simplified signature**: `log_value(line: int, value: Any)` (removed `log_type` and `error_context` params)
- **Raw HTML output**: Just `html.escape(repr(value))` without `<div>` wrapper
- **Unified calls**: All AST nodes call `_log_value()`
- **Error format**: `f"{error_type}: {error_message}"` passed to `log_value()`

## Bare Expression and Print Statement Visualization

**COMPLETED**: Added visualization for bare expressions and print statement first arguments (June 5, 2025)

### New Features Added
1. **Bare Expression Statements**: Any standalone expression on a line (e.g., `x + 5`, `func()`) now gets visualized
2. **Print Statement First Arguments**: The first argument of any `print()` call is captured and visualized

### Implementation Details

#### Bare Expression Visualization (`visit_Expr`)
- **Purpose**: Capture and visualize standalone expressions that aren't assignments
- **Transformation**: `x + 5` becomes:
  ```python
  _snc_temp_1 = x + 5
  _log_value(1, _snc_temp_1)
  _snc_temp_1  # Preserve original expression
  ```

#### Print Statement Visualization (`visit_Call`)
- **Purpose**: Capture the first argument being printed while preserving print behavior
- **Transformation**: `print("hello", "world")` becomes:
  ```python
  print(_log_and_return(line, "hello"), "world")
  ```
- **Helper Function**: `log_and_return(line, value)` logs the value and returns it unchanged

### Technical Implementation
- **AST Transformation**: Added `visit_Expr()` and enhanced `visit_Call()` methods
- **Helper Function**: `log_and_return()` for inline logging without side effects
- **Globals**: Added `_log_and_return` to execution globals dictionary
- **Line Preservation**: Maintains original line numbers for accurate visualization placement

## Multiple Print Arguments Visualization

**COMPLETED**: Enhanced print statement visualization to show ALL positional arguments (June 6, 2025)

### Problem Solved
- Previously only the first argument of print statements was visualized
- Users couldn't see all values being printed in multi-argument print calls
- Limited debugging capability for complex print statements

### Implementation Details
- **File Modified**: `src/vs/platform/snc/node/python_runner.py`
- **Method Enhanced**: `visit_Call()` method in `CodeTransformer` class
- **Change**: Modified to iterate through ALL positional arguments instead of just the first one
- **Approach**: `for i, arg in enumerate(node.args)` wraps each positional argument with `_log_and_return`

### Transformation Examples
**Before**:
```python
print("hello", "world", 123, sep="-")
```
Becomes:
```python
print(_log_and_return(line, "hello"), "world", 123, sep="-")
```
Only `"hello"` was visualized.

**After**:
```python
print("hello", "world", 123, sep="-")
```
Becomes:
```python
print(_log_and_return(line, "hello"), _log_and_return(line, "world"), _log_and_return(line, 123), sep="-")
```
All three values (`"hello"`, `"world"`, `123`) are visualized.

### Technical Details
- Iterates through `node.args` using `enumerate()` for positional arguments
- Each argument wrapped individually with `_log_and_return()` function
- Column offset calculation prevents AST node conflicts: `node.col_offset + (i * 20)`
- Keyword arguments (`node.keywords`) preserved without modification
- Maintains original print call behavior and output formatting

## Return Value Visualization

**COMPLETED**: Added return statement visualization to show function return values (June 9, 2025)

### Problem Solved
- Return statements were not being visualized, making it difficult to debug function outputs
- Users couldn't see what values their functions were actually returning
- Missing visibility into one of the most important aspects of function behavior

### Implementation Details
- **File Modified**: `src/vs/platform/snc/node/python_runner.py`
- **Method Added**: `visit_Return()` method in `CodeTransformer` class
- **Approach**: Uses temporary variables to capture return values before they're returned
- **Bare Returns**: Special handling for `return` statements with no expression (logs `None`)

### Transformation Examples

**Return with Expression**:
```python
return x + 5
```
Becomes:
```python
_snc_temp_1 = x + 5
_log_value(line, _snc_temp_1)
return _snc_temp_1
```

**Bare Return**:
```python
return
```
Becomes:
```python
_log_value(line, None)
return
```

### Technical Implementation
- **Expression Returns**: Creates temp variable to store expression result, logs it, then returns temp variable
- **Bare Returns**: Directly logs `None` constant since Python functions return `None` by default
- **AST Node Creation**: Proper handling of AST node location information to avoid compilation errors
- **Side Effect Prevention**: Uses temporary variables to ensure expressions are only evaluated once

## Cursor/Focus Rerun Policy Update — August 18, 2025

Updated renderer behavior to avoid unnecessary reruns and to preserve visualizations.

### Behavior
- Cursor move: does not rerun the Python runner; only re-renders with existing data to switch between first/last loop iteration.
- Tab focus (editor visibility change): reruns (with a 1000ms delay) to refresh values; existing visualizations remain visible until new results stream in (no clear/flicker).
- App focus (window focus) without tab change: does not rerun; re-renders with existing data if present.

### Frontend Implementation (`src/vs/editor/contrib/snc/browser/snc.ts`)
- New fields:
  - `cursorUpdateTimer` to throttle cursor-based re-renders.
- Streaming handlers:
  - On 'item': push to `streamedItems` for immediate cursor-based re-renders.
- Cursor move:
  - `onCursorPositionChanged()` now throttles and calls `updateVisualizationWidgets()` using `streamedItems`
- Window focus:
  - `onWindowBecameVisible()` re-renders using current data; removed any rerun on window focus.

### Rationale
- Aligns with requirement: "don't rerun the runner on cursor move ... rerun should only happen on tab focus or code edits."
- Improves perceived stability and reduces flicker when switching tabs.
