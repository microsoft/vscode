# Changelog

## 1.125.0 (Unreleased)

- Fixed an issue where attribute values containing '='s could be truncated in some scenarios (<https://github.com/quarto-dev/quarto/pull/814>).

## 1.124.0 (Release on 2025-08-20)

- Fix Base64 leak when no empty line between text and code block (<https://github.com/quarto-dev/quarto/pull/780>).
- Add yaml frontmatter validation to visual editor (<https://github.com/quarto-dev/quarto/pull/744>).
- Do not prepend path delimiter to path when Quarto is detected (<https://github.com/quarto-dev/quarto/pull/778>).

## 1.123.0 (Release on 2025-06-17)

- Fixed a bug with switching between source and visual editors in Positron (<https://github.com/quarto-dev/quarto/pull/732>).

## 1.122.0 (Release on 2025-05-26)

- Language server temporary files are now permanently deleted, bypassing the trash can (<https://github.com/quarto-dev/quarto/pull/714>).
- Change controls on Positron editor action bar and fix "Render on Save" behavior (<https://github.com/quarto-dev/quarto/pull/706>).
- Add additional new control ("Insert Code Cell") to Positron editor action bar (<https://github.com/quarto-dev/quarto/pull/709>).
- Turn off completions in visual mode in Positron, as a temporary stopgap until we can invest more in LSP features in the visual editor (<https://github.com/quarto-dev/quarto/pull/710>).

## 1.121.0 (Release on 2025-05-02)

- Add new controls for Positron editor action bar (<https://github.com/quarto-dev/quarto/pull/698>).
- Improve editor focus preservation behavior (<https://github.com/quarto-dev/quarto/pull/699>).

## 1.120.0 (Release on 2025-04-07)

- Fix issue where format on save could overwrite the contents of a document with incorrect results (<https://github.com/quarto-dev/quarto/pull/688>).

## 1.119.0 (Release on 2025-03-21)

- Use `QUARTO_VISUAL_EDITOR_CONFIRMED` > `PW_TEST` > `CI` to bypass (`true`) or force (`false`) the Visual Editor confirmation dialogue (<https://github.com/quarto-dev/quarto/pull/654>).
- Fix behavior in Positron when running a cell containing invalid/incomplete code (<https://github.com/quarto-dev/quarto/pull/664>).
- Ensure `#|` is added only at the beginning of a new line (<https://github.com/quarto-dev/quarto/pull/649>).
- Fix `language` typos throughout the codebase (<https://github.com/quarto-dev/quarto/pull/650>)
- Update cell background configuration to add the ability to use the appropriate theme color. The `quarto.cells.background` settings have changed names so you may need to update your configuration (<https://github.com/quarto-dev/quarto/pull/679>).
- Use new command to switch between source and visual editors in Positron (<https://github.com/quarto-dev/quarto/pull/684>).

## 1.118.0 (Release on 2024-11-26)

- Provide F1 help at cursor in Positron (<https://github.com/quarto-dev/quarto/pull/599>)
- Expose new context keys for the main language of a document (<https://github.com/quarto-dev/quarto/pull/608>)
- No longer send all snippet suggestions to the bottom of the completion list (<https://github.com/quarto-dev/quarto/pull/609>).

## 1.117.0 (Release on 2024-11-07)

- Fix issue with temp files for LSP request virtual documents (<https://github.com/quarto-dev/quarto/pull/585>)
- Improved statement execution for Python `.qmd` files in Positron (<https://github.com/quarto-dev/quarto/pull/589>)
- Automatically open `.qmd` files in visual or source editor if specified (<https://github.com/quarto-dev/quarto/pull/577>)

## 1.116.0 (Release on 2024-10-08)

- Fix issue with raw html blocks being removed from document by Visual Editor (<https://github.com/quarto-dev/quarto/issues/552>)
- Fix issue with raw latex blocks being removed from document by Visual Editor (<https://github.com/quarto-dev/quarto/issues/558>)
- Support validation and autocompletion for `_brand.yml` files if supported by the Quarto version (>= 1.6.24) (<https://github.com/quarto-dev/quarto/issues/565>)

## 1.115.0 (Release on 2024-09-20)

- Suppress background highlight on first line (<https://github.com/quarto-dev/quarto/pull/537>).
- In Source Mode, `Insert Code Cell` now places your cursor directly into the code cell if you've already specified the language in a previous cell (<https://github.com/quarto-dev/quarto/pull/540>).
- Improved reliability of sequential execution of code cells in Positron (<https://github.com/quarto-dev/quarto/pull/510>).

## 1.114.0 (Release on 2024-08-06)

- Update front matter Markdown grammar specification (<https://github.com/quarto-dev/quarto/pull/506>).

## 1.113.0 (Release on 2024-05-30)

- Check for new Quarto version for R pkg support.

## 1.112.0 (Release on 2024-05-29)

- Add GH action to generate .visx
- Render output in a temp directory when in an R package
- Improved statement execution

## 1.111.0 (Release on 2024-02-29)

- Use Preview icon on editor toolbar (text on toolbar no longer supported)

## 1.110.1 (Release on 2024-01-02)

- Target architecture specific pandoc on linux and mac

## 1.110.0 (Release on 2024-01-01)

- MacOS: automatically resolve arch-specific pandoc path
- Enable snippet suggestions in qmd mode
- Visual Editor: Preserve shortcodes in link targets
- Correct config value for disabling word based suggestions
- Embedded syntax hightlighting and cell execution for Stata

## 1.109.0 (Release on 2023-12-07)

- Apply formatting to correct range in presence of YAML options

## 1.108.0 (Release on 2023-11-28)

- Correct when clause for Insert Code Cell
- Preview and Render of Knitr spin scripts (.r)
- Improved code formatting for Python cells

## 1.107.0 (Release on 2023-11-15)

- Improved code intelligence for deno / typescript cells
- Fully register typst language configuration

## 1.106.4 (Release on 2023-11-06)

- Visual Editor: Correctly remove chapter prefixes from section headings after round-trip

## 1.106.3 (Release on 2023-11-02)

- Ignore trigger characters for YAML completions

## 1.106.2 (Release on 2023-10-30)

- Support for dashboard completion context

## 1.106.1 (Release on 2023-10-29)

- Visual Editor: Use line-height of 1.2 for headings
- Catch initialization errors that occur when probing for Python environments

## 1.106.0 (Release on 2023-10-27)

- Remove Preview PDF/DOCX/etc. commands (replaced by Preview Format command on editor title menu)
- When using a venv or conda environment, prefer Quarto CLI installed with pip in that environment
- Update address bar when previewed content sends 'hashchange' message
- More graceful behavior when Quarto not installed (verify installation, startup error, etc.)
- Eliminate ellipses input rule (common construct in code blocks)
- Don't do any special handling for quotes / fancy quotes in visual editor

## 1.105.0 (Release on 2023-10-16)

- Run Line is now Run Selected Line(s) and matches exactly previous behavior of Cmd+Enter

## 1.104.0 (Release on 2023-10-15)

- Run line command that always runs a single line where the cursor is
- Dispose webview panel after restoring it from workbench reload
- Add basic editing support for prql code cells
- Improve appearance of visual editor HR in dark and high contrast modes

## 1.103.0 (Release on 2023-10-10)

- Compatibility with in-place reload of server: shiny
- Clear webview URL after restoring it

## 1.102.0 (Release on 2023-10-08)

- Execution keyboard shortcuts more consistent w/ Jupyter (Shift+Enter, etc.)
- Quarto: Preview run/title menus for scripts with percent cells
- Support preview zoom level for server: shiny documents
- Improved server: shiny support for VS Code in the browser configurations
- Default to rendering on save for server: shiny documents
- Support server: shiny documents from .py percent scripts
- Only prompt for installation of Lua extension when developing extensions
- Use longer terminal 5-second terminal delay only for conda (venv always activates quickly)
- Restore rather than dispose of preview webview on reload

## 1.101.0 (Release on 2023-09-28)

- Improve Render Project format handling when there is only one format
- Restore format specific preview commands (e.g. "Preview PDF", "Preview DOCX", etc.)
- Do not apply smarty rules to plain text pastes

## 1.100.0 (Release on 2023-09-24)

- Revamp Preview and Render commands to be more consistent with CLI
- Correct preview slide navigation when toc: true

## 1.99.0 (Release on 2023-09-22)

- Add option controlling whether reticulate is used for Python in Knitr documents.
- Fix issue w/ resolving go to definition for R extension
- Restore previous document formatting behavior (resolved underlying issue)

## 1.98.0 (Release on 2023-09-12)

- Fix for JSON being highlighted as JS when in `{.json}` form
- Fix for incorrect offsets in code cell formatting / format on save

## 1.97.0 (Release on 2023-09-04)

- Support for rendering Jupyter percent scripts

## 1.96.0 (Release on 2023-09-03)

- Formatting: format only currently active cell
- Syntax highlighting for embedded `typst` raw blocks
- Revert to previous toggle comment behavior (single line)

## 1.95.1 (Release on 2023-08-25)

- Revert .intellisense.* change (caused completion to break!)

## 1.95.0 (Release on 2023-08-25)

- Jupyter: Run cell-by-cell only when there are cell magics (%%) present
- Jupyter: Verify that the ms-toolsai.jupyter extension is installed
- Mark temporary .intellisense. files as plaintext so they are not auto-formatted
- Use triple-dash for block and line comments
- Visual Editor: Use correct selection text color in high contrast mode
- Visual Editor: Workaround Pandoc 3.1.4 change in `--id-prefix` behavior
- Visual Editor: Remove it_IT spelling dictionary

## 1.94.0 (Release on 2023-08-17)

- Correctly handle preview URLs with spaces within website/book projects
- Ensure that executed cells include a trailing newline

## 1.93.0 (Release on 2023-08-14)

- Visual editor: Ensure that raw inline html without tags uses explicit inline syntax
- Enable cell tools and render/preview for .Rmd files

## 1.92.0 (Release on 2023-08-08)

- Support for executing Python code within Knitr documents using reticulate
- Start new preview server for format-specific render w/ render-on-save
- Add keyboard shortcodes for cell navigation and focus assist
- Improve detection of dark mode for dark high contrast theme

## 1.91.0 (Release on 2023-08-02)

- Preview: inherit body background color from editor background color
- Reveal: correct slide syncing even when title is specified in _quarto.yml
- Add `manuscript` project type to Create Project command

## 1.90.1 (Release on 2023-07-22)

- No changes (bumped version to force repulish on Open VSX)

## 1.90.0 (Release on 2023-07-18)

- Jupyter embed completions for markdown figures
- Background highlighting for inline code expressions
- Only move source cursor when switching from visual
- Improved cursor location when switching from source to visual

## 1.89.0 (Release on 2023-07-07)

- Path and content completions for include and embed shortcodes
- More reliable indexing for Book cross-references
- Syntax highlight code blocks where attributes include an id
- Fix issue with tokenizing language-only fenced code
- Render: Improved detection of active notebooks
- Visual Editor: Omni insert command for shortcodes
- Visual Editor: Restore link paste handling (regression from markdown paste)
- Visual Editor: Apply link to text when pasting links over selections

## 1.88.0 (Release on 2023-06-25)

- Visual Editor: Remove formik validation (fixes various dialog focus issues)
- Prevent display of error messages for div attributes that we fail to parse

## 1.87.3 (Release on 2023-06-07)

- Ensure that Go to next/previous cell traverses all executable blocks
- Attempt to restore focus to visual editor when switching back to the window
- Fix for regression of image hover preview (for images > ~75k)
- Reduce the number of registered 'file new' commands
- Visual Editor: Disable spellcheck in attribute dialogs
- Visual Editor: More flexible data entry for math ids
- Visual Editor: Enable removal of ids from math blocks
- Visual Editor: Don't focus view after omni-insert that displays a dialog

## 1.87.2 (Release on 2023-06-02)

- Fix issue w/ parsing math blocks at the end of documents
- Disable styler in R intellisense background document
- Ensure that all files in the workspace are indexed when required
- Provide whatever features we can even if Quarto isn't installed

## 1.87.1 (Release on 2023-05-31)

- Fix issue with failure to parse executable blocks from markdown
- Fix issues w/ mathjax hover (theme propagation and extra '+')

## 1.87.0 (Release on 2023-05-31)

- Switch back to markdown-it parser (performance on Windows & w/ multi-byte text)
- Visual Editor: Support Cmd+Shift+V shortcut for pasting without formatting
- Visual Editor: Render pasted markdown text rather than treating it literally
- Language support (highlighting, completion, etc.) for embedded Matlab code cells
- Render All command to render and preview all specified formats
- Fix crash caused by improper initialization of LSP configuration
- Fail gracefully when we are unable to read zotero key

## 1.86.2 (Release on 2023-05-26)

- Fix incompatibility with older Quarto/Pandoc versions introduced in v1.86.0

## 1.86.1 (Release on 2023-05-26)

- Warn at extension load time if Quarto can't be found on the system
- Add 'Quarto: Verify Installation' command to explicitly check for Quarto.

## 1.86.0 (Release on 2023-05-26)

- Parse markdown w/ Pandoc rather than markdown-it (improve symbols, folding, etc.)
- Go to Definition and Find References for hypyerlinks
- Markdown diagnostics (disabled by default, set `markdown.validate.enabled` to enable)
- Handle workspace symbols, link definitions, and hover within the LSP
- Visual Editor: Use Fluent UI v9 as component library
- Visual Editor: Allow for \ in completion token (Julia symbol completions)
- Visual Editor: Don't encode/decode image URLs when round-tripping through editor
- Disable Quarto commands, etc. when Quarto isn't installed

## 1.85.0 (Release on 2023-05-07)

- Pass working directory to Julia REPL when executing cells
- Show Quarto Assist contextual help when editing cells in visual mode

## 1.84.0 (Release on 2023-05-03)

- Support for local Zotero databases in visaul editor citations
- Toggle comment (%%) for Mermaid diagram editing
- Support math preview in list items with > 2 blocks
- Don't show GitLens hovers in Quarto Assist panel
- Restore Quarto Assist for non-qmd file types
- Fix issue w/ Visual Editor paste behavior on Windows

## 1.83.0 (Release on 2023-04-28)

- Correct syntax highlighting for list items and blockquote character
- Enable Quarto: Render Project command for Hugo and Docusausus projects
- Exclude parens from cite/crossref highlighting in visual editor
- Correct hover/preview behavior for display math in lists
- Syntax highlighting for `plantuml` code blocks
- Remove custom paste hadling for links (too many unwanted side effects)
- Only update Quarto Assist panel for Quarto docs
- Visual mode select all in codeblock now targets just the code block
- Correctly advance selection for line-by-line execution in visual mode

## 1.82.0 (Release on 2023-04-21)

- Fixed position for preview toolbar and content frame.

## 1.81.0 (Release on 2023-04-14)

- Configurable zoom behavior for HTML document preview
- Notebook markdown renderer for Pandoc/Quarto markdown extensions
- Correct hover behavior for multiple equations on a single line

## 1.80.0 (Release on 2023-04-09)

- Support Zotero Web Libraries in visual editor citation insert/completions

## 1.79.0 (Release on 2023-03-30)

- Improved handling/display of errors during visual editor initialization
- Prevent freeze during multi-block paste on windows.

## 1.78.0 (Release on 2023-03-23)

- Fix crossref indexing when running with Quarto v1.3
- Improve highlighting regex for citation / reference ids
- Prevent redraw of visual editor decorators on save
- Preserve visual editor focus on render errors
- Navigation to slide at cursor for reveal preview initial load
- Improve fidelity of syncing to current slide for reveal preview

## 1.77.0 (Release on 2023-03-17)

- Make Shift-Drag/Drop of images conditional on VS Code >= 1.74

## 1.76.0 (Release on 2023-03-16)

- Support for Shift-Drag/Drop of images in markdown source editor
- Provide option for visual editor font (defaults to Markdown Preview font)
- Support languages with prefix (e.g. shinylive-python) in visual editor

## 1.75.0 (Release on 2023-03-14)

- Scope Format Cell change to Python 'black' formatter only.

## 1.74.0 (Release on 2023-03-13)

- Format Cell for language formatters that don't support selection formatting
- Handle errors cleaning up virtual docs more gracefully.

## 1.73.0 (Release on 2023-03-09)

- Support for Preview in GitHub Codespaces
- Support for codicons (editor, preview) in GitHub Codespaces

## 1.72.0 (Release on 2023-03-07)

- Correct scrolling behavior for visual editor outline
- Fix preview syncing for presentations with level 1 headings
- Improve visual editor insert menu (YAML, Code Cell vs. Block)
- Add Julia code cell command to visual editor
- Handle entirely empty documents in the visual editor

## 1.71.0 (Release on 2023-02-28)

- Format Document/Range now supports workspace formatting config
- Go to Definition now works with local file references
- Ensure that empty links survive visual editor round trip
- Protect against null ref when syncing source position

## 1.70.2 (Release on 2023-02-27)

- Fix issue w/ visual editor generating heading ids for Quarto v1.3 (Pandoc 3)

## 1.70.1 (Release on 2023-02-26)

- Correct theme for math preview in visual editor

## 1.70.0 (Release on 2023-02-26)

- Cell execution and navigation for visual mode
- Mermaid and GraphViz diagram preview for visual mode
- Improved filtering of completion states based on spaces, trigger chars, etc.
- Formatting: only run for `qmd` (not `md`) and never delegate to other handlers

## 1.69.0 (Release on 2023-02-23)

- Automatically insert option comments (e.g. `#| `) on enter
- Completion for YAML options within cell comments
- Improved handling of escaped executable code blocks (required for Pandoc v3)
- Update background highlight for all visible editors (not just active)
- Improve cursor placement for YAML block insertion
- More robust handling when parsing empty yaml metadata blocks
- Fix for editor scrollIntoView that targets text nodes (as opposed to blocks)

## 1.68.0 (Release on 2023-02-20)

- Provide choice of language for insert cell command
- Fix YAML completions for 3-character prefix
- Improved gap cursor click handler (handle all code view types)
- Handle exceptions that occur when writing settings at startup
- Correct indentation for multi-line YAML completions
- Fix issue w/ handling visual mode untitled document warning
- Resolve issue w/ reading large bibliographies
- Allow dot ('.') in citation highlighting regex
- Derive `mathjax.theme` from name of `workbench.colorTheme`

## 1.67.0 (Release on 2023-02-18)

- Code completion for cells and YAML metadata within visual editor
- Support for editing Pandoc v3.0 Figure AST nodes.
- Change location of edit in visual/source context menu item
- Use resource scoping for visual editor preferences
- Resolve full path when setting QUARTO_PYTHON from Python extension config
- Don't offer LaTeX completions for `\\`
- Ensure that empty code block class doesn't show up in the visual editor
- Add `mermaid` and `dot` to insert code cell snippet

## 1.66.0 (Release on 2023-02-14)

- Document, range, and cell formatting for Python and Julia code
- Write code blocks without attributes using back ticks rather than indented 4 spaces
- Automatically generate references prefix for book projects

## 1.65.0 (Release on 2023-02-10)

- Revert change to run Python blocks as one piece of code (breaks magics)

## 1.64.0 (Release on 2023-02-09)

- Support for writing markdown reference links
- Improve backspace handling for empty blocks that follow code blocks
- Fix issue with recognizing consecutive inline math expressions.
- Fix issue with shortcodes that start a line when going source to visual.
- Ignore leading and trailing whitespace when evaluating DOI search terms.
- Improved detection of inline math input (require leading space for disambiguation)
- Don't wrap sentences that are already followed by a line break
- Preserve list tight attribute when editing sublists

## 1.63.0 (Release on 2023-02-08)

- Support for executing `bash` and `sh` code cells
- Run Jupyter cells in one shot (otherwise they can run out of order)
- Implement support for Go to Definition within code cells
- Update to Mermaid JS v9.3.0 (prevent preview errors for YAML front matter)
- Only show Quarto Assist panel when the extension is activated
- Disable Copilot by default for Quarto documents
- Prevent preview from hanging when terminals run in an editor tab

## 1.62.0 (Release on 2023-02-08)

- Automatically update images in visual editor when they change on disk.
- Navigation to cross references located in other project files.
- Fix issue w/ spurious editor opens after switching modes.
- Preserve header bit when copying and pasting tables in visual mode.
- Improved paste handling from MS Word
- Scroll content in full page code blocks into view during fine
- Per-document state for show/hide of outline
- Improved editing (backspace key handling) for definition lists
- Sync visual editor syntax highlighting to current VS Code theme
- Completion: Respect absolute paths for bibliography and csl

## 1.61.0 (Release on 2023-02-02)

- Spell checking: ignore words with uppercase letters.
- Fix issue with render keybinding on Windows.
- Activate extension when visual editor loads.

## 1.60.0 (Release on 2023-01-31)

- Prevent render on save from occurring for documents not being actively previewed.
- Evaluate tex macros for equation hover/preview.
- Preview of visual markdown editor (use "Edit in Visual/Source Mode" command or context menu to switch modes).

## 1.59.0 (Release on 2022-12-15)

- Repo cleanup

## 1.58.0 (Release on 2022-12-15)

- Move to new repo (https://github.com/quarto-dev/quarto/tree/main/apps/vscode)

## 1.57.0 (Release on 2022-12-03)

- Enable preview of XML files (useful for JATS)
- Add "document" role to Quarto Lens

## 1.56.0 (Release on 2022-11-19)

- Resolve Python completion problems (adjust completion positions for inject)
- Return multiple hover results from hover provider

## 1.55.0 (Release on 2022-11-11)

- Don't use '-' as a completion trigger character (messes up crossref completions)

## 1.54.0 (Release on 2022-10-31)

- Intelligent run selection for R (runs complete statement not just line)
- Improve handling of first-run files for create project command

## 1.53.0 (Release on 2022-10-27)

- Once again use full path in WSL (previous change wasn't effective)

## 1.52.0 (Release on 2022-10-26)

- Don't include full path for preview file when running on WSL

## 1.51.0 (Release on 2022-10-24)

- Always render on save for notebooks (as they don't execute by default)
- Improved slide preview for notebooks (return last slide)

## 1.50.0 (Release on 2022-10-19)

- Run only selected text for non-empty editor selections
- Filter crossref completions by prefix match

## 1.49.0 (Release on 2022-10-19)

- Add create project command to file -> new file menu
- Don't re-show the terminal unless a rendering error occurs
- Add status bar progress for rendering
- Don't show bibliography completions unless they match the prefix

## 1.48.0 (Release on 2022-10-14)

- Implement smart paste of links (surround selected text)
- Use REditorSupport.r as ID for R extension

## 1.47.0 (Release on 2022-10-13)

- Quarto: Create Project command for creating common project types
- Don't use forward slashes in path when running Quarto with cmd /C

## 1.46.0 (Release on 2022-10-10)

- Survive missing vscode.workspace.onDidSaveNotebookDocument in versions < 1.67

## 1.45.0 (Release on 2022-10-04)

- Respect `eval: false` for cell execution commands
- LaTeX equation preview: include \newcommand (and similar) definitions in preview
- Correct package.json configuration for quick suggestions
- Outline view: protect against unparseable YAML in title block

## 1.44.0 (Release on 2022-10-03)

- Preview path compatibility for Git Bash terminal on Windows

## 1.43.0 (Release on 2022-09-29)

- Remove automatic spelling configuration for Spell Right
- Ensure that crossrefs aren't processed for display equation preview

## 1.42.0 (Release on 2022-09-28)

- Make Quarto Render commands available for `markdown` document type
- Improve default spelling ignore (ignore characters after `.` and `-` in words)
- Syntax highlighting for raw `mdx` blocks.

## 1.41.0 (Release on 2022-09-25)

- Automatically configure spell-checking for Quarto documents when the Spell Right extension is installed.
- Recognize control channel for external preview servers (Quarto v1.2)
- Allow preview for Hugo documents (Quarto v1.2 Hugo project type)

## 1.40.0 (Release on 2022-09-21)

- Improved default completion settings for Lua extension

## 1.39.0 (Release on 2022-09-20)

- Provide workspace type definitions for Lua filters and shortcodes
- Error navigation for Lua runtime errors in currently edited file
- Provide completions and diagnostics for profile specific \_quarto.yml
- Cleanup residual Quarto Preview panel on startup/reload
- Activate Quarto extension when .qmd files are in the workspace

## 1.38.0 (Release on 2022-09-10)

- Use `quarto inspect` for reading project configuration.
- Pass absolute path to `quarto preview` (prevent problems with shells that change dir on init)
- Only render on save when the preview server is already running

## 1.37.0 (Release on 2022-09-05)

- Open external preview links in new window (requires Quarto v1.2)
- Set `QUARTO_WORKING_DIR` environment variable (ensures correct working dir is used for preview)
- Remove default keybindings for bold, italic, and code (all had conflicts)

## 1.36.0 (Release on 2022-09-01)

- Render on Save option (automatically render when documents are saved)
- Keyboard shortcuts for toggling bold, italic, and code formatting
- Minimum required VS Code version is now 1.66

## 1.35.0 (Release on 2022-08-31)

- Support for render and preview of Shiny interactive docs
- Highlighting, completion, and execution for language block variations
- Rename Render Word to Render DOCX

## 1.34.0 (Release on 2022-08-30)

- Do not execute YAML option lines (enables execution of cell magics)
- Don't require a cell selection for 'Run All Cells'
- Run Python cells as distinct commands in Interactive Console
- Use Quarto executable rather than .cmd script when supported
- When not discovered on the PATH, scan for versions of Quarto in known locations

## 1.33.0 (Release on 2022-08-24)

- Code completion for cross references
- Automatic navigation to render errors for Jupyter, Knitr, and YAML
- Add Shift+Enter keybinding for running the current selection
- Fix: citation completions on Windows

## 1.32.0 (Release on 2022-08-13)

- Wait for Python environment to activate before quarto preview

## 1.31.0 (Release on 2022-08-11)

- Support for completions in \_extension.yml
- Fix for CMD shell quoting issues in quarto preview

## 1.30.0 (Release on 2022-08-02)

- Completions and hover/assist for citations
- Code snippet for inserting spans

## 1.29.0 (Release on 2022-07-26)

- Correct shell quoting for quarto preview on windows

## 1.28.0 (Release on 2022-07-20)

- Use terminal for quarto preview

## 1.27.0 (Release on 2022-07-16)

- Set LANG environment variable for quarto render/preview

## 1.26.0 (Release on 2022-07-09)

- Use output channel for quarto preview
- Fix syntax highlighting for strikethrough

## 1.25.0 (Release on 2022-07-02)

- Improve detection of current slide for revealjs preview
- Automatically disable terminal shell integration for workspace

## 1.24.0 (Release on 2022-06-03)

- Automatically insert option comment prefix in executable cells
- Remove 'Focus Lock' indicator from preview
- Fix for document outline display when there are empty headings

## 1.23.0 (Release on 2022-05-29)

- Support VS Code command keyboard shortcuts while preview is focused
- Support clipboard operations within preview iframe
- Prevent flake8 diagnostics from appearing in intellisense temp file
- Register Quarto assist panel as an explorer view

## 1.22.0 (Release on 2022-05-23)

- Improve math highlighting rules (delegate to builtin rules)

## 1.21.0 (Release on 2022-05-20)

- Move Quarto Assist panel to activity bar

## 1.20.2 (Release on 2022-05-19)

- Run preview from workspace root if there is no project
- Tolerate space between # and | for yaml option completion
- Trim trailing newline from selection for R execution

## 1.20.1 (Release on 2022-05-13)

- Debounce reporting of errors in diagram preview
- Correct path for graphviz language configuration

## 1.20.0 (Release on 2022-05-12)

- Syntax highlighting, snippets and live preview for diagrams
- Run preview for project files from project root directory
- Run cell for cells using inline knitr chunk options

## 1.19.1 (Release on 2022-05-05)

- Open file preview externally for non-localhost

## 1.19.0 (Release on 2022-05-04)

- Prompt for installation on render if quarto not found
- Print full proxied session URL when running under RSW

## 1.18.1 (Release on 2022-05-03)

- Support old and new (reditorsupport.r) R extension ids

## 1.18.0 (Release on 2022-04-30)

- Revert to using terminal for quarto preview
- Improved editor handling of shortcodes (auto-close, snippet)

## 1.17.0 (Release on 2022-04-25)

- Getting started with Quarto walkthrough
- Warn when files are saved with invalid extensions

## 1.16.0 (Release on 2022-04-23)

- Improved math syntax highlighting
- Don't include callout headers in toc

## 1.15.0 (Release on 2022-04-22)

- Icon for qmd file type
- Terminate preview command
- Don't auto-pair back-ticks

## 1.14.0 (Release on 2022-04-19)

- Format specific render commands (HTML, PDF, Word)
- Use output channel rather than terminal for preview
- Clear Cache command for Jupyter & Knitr caches
- Auto-closing pair behavior for quotes
- Preference to control preview location

## 1.13.0 (Release on 2022-04-14)

- Render button on editor toolbar
- Improved webview focus management
- Activate when executing new notebook command

## 1.12.1 (Release on 2022-04-04)

- Disable snippet suggestions by default

## 1.12.0 (Release on 2022-04-03)

- Insert code cell command (Ctrl+Shift+I)
- Navigate revealjs preview to slide at cursor
- Commands for creating documents and presentations
- Code folding for divs and front matter

## 1.11.2 (Release on 2022-03-30)

- Don't show preview in Hugo projects (hugo serve provides preview)
- Render Project command for full render of all documents in project
- Improved compatibility with VS Code web mode

## 1.11.1 (Release on 2022-03-29)

- Use Ctrl+Shift+K as keyboard shortcut for render
- Match current dark/light theme for text format preview

## 1.11.0 (Release on 2022-03-29)

- Render command with integrated preview pane
- Use same versions of Python and R as configured for their respective extensions
- Preference to use alternate quarto binary

## 1.10.0 (Release on 2022-03-15)

- Message when extensions required for cell execution aren't installed
- Scroll to top when setting assist pane contents

## 1.9.0 (Release on 2022-03-13)

- Syntax highlighting, completion, and cell execution for Julia
- Hover and assist preview for markdown images
- Assist panel content can now be pinned/unpinned

## 1.8.0 (Release on 2022-03-11)

- Syntax highlighting for embedded LaTeX
- Completion for MathJax-compatible LaTeX commands
- Hover and assist preview for MathJax equations

## 1.7.0 (Release on 2022-03-08)

- Quarto Assist panel for contextual help as you edit
- Code Lens to execute code from R executable code blocks
- Hover help provider for Quarto YAML options
- Additional language features (outline, folding, etc) in VS code for the web

## 1.6.0 (Release on 2022-03-03)

- Completion for Quarto markdown classes and attributes
- Commands and keyboard shortcuts for cell execution and navigation
- Improved markdown parsing performance
- VS code for the web compatibility (syntax highlighting and snippets)

## 1.5.2 (Release on 2022-02-28)

- Improved embedded completions for R (keep R LSP alive across requests)

## 1.5.0 (Release on 2022-02-27)

- Code completion and diagnostics for YAML front matter and cell options
- Commands and keybindings for running current cell, previous cells, and selected line(s)
- Code Lens to execute code from Python executable code blocks
- Workspace symbol provider for quick navigation to documents/headings

## 1.4.0 (Release on 2022-02-23)

- Completion, hover, and signature help for embedded languages, including
  Python, R, LaTeX, and HTML

## 1.3.0 (Release on 2022-02-17)

- Background highlighting for code cells
- Syntax highlighting for citations, divs, callouts, and code cells
- Snippets for divs, callouts, and code cells
- Improved TOC display (better icon, exclude heading markers)
- Improved completion defaults (enable quick suggestions, disable snippet and word-based suggestions)
- Use commonmark mode for markdown-it parsing

## 1.2.0 (Release on 2022-02-15)

- Clickable links within documents
- Code completion for link and image paths

## 1.1.0 (Release on 2022-02-15)

- Code folding and table of contents
- Workspace and document symbol providers
- Selection range provider

## 1.0.1 (Release on 2022-02-10)

- Minor patch to improve extension metadata and marketplace listing

## 1.0.0 (Release on 2022-02-10)

- Syntax highlighting for `.qmd` files
- Snippets for `.qmd` files
