# HTML response previews

## Investigation

- [Claude custom visuals in chat and Cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork) are generated HTML rendered inline, distinct from persistent artifacts. They can support charts, diagrams, comparisons, and interactive controls.
- [ChatGPT code blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt) separate Code from Preview, render supported HTML and other formats in a sandbox, and can request permission for outside resources.
- [ChatGPT Intelligent UI](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt) also composes text, visuals, and interactive elements directly in responses. Its public documentation describes behavior, not an implementation protocol to reuse.
- [Claude Code: The unreasonable effectiveness of HTML](https://claude.dev/blog/using-claude-code-the-unreasonable-effectiveness-of-html/) emphasizes navigable reports, plans, reviews, and reusable files. The larger reading surface, fragment links, sanitized export, and authoring skill support that workflow; its JavaScript-driven editors remain outside this static preview's scope.

The reusable pattern is an explicit content boundary plus an isolated renderer, not relaxing Markdown sanitization. These sources document product behavior; they do not establish the vendors' private rendering or sandbox implementations.

## Implemented scope

The Agents window opts into a shared chat renderer for **explicit, closed `html-preview` fenced blocks in assistant responses**. The `chat.htmlPreview.enabled` setting defaults to `true`; disabling it displays these blocks as source code and updates existing responses without reloading. Previously opened expanded editors remain independent snapshots. Ordinary `html` fences, user messages, raw HTML outside a fence, annotated file edits, and other chat surfaces keep their existing behavior. Providers do not need a new protocol response type: the original Markdown remains the persisted, copied, exported, and accessible response.

The preview displays sanitized HTML, CSS, simple inline SVG, embedded PNG/JPEG/GIF/WebP images, native `details`/`summary` disclosures, and links to sections within the document. Fragment-only HTML anchors are normalized; malformed fragments, external navigation, and SVG links are removed. Each preview uses a script-disabled VS Code webview with no local resource roots or service worker, disabled forms and command URIs, and a restrictive Content Security Policy. Active markup, foreign SVG content, and webview context attributes are removed. CSS is confined to the webview and cannot style the workbench. Network resources are blocked, including CSS imports and remote images.

This is deliberately **not an arbitrary JavaScript/React app runtime**. Scripts, external libraries, fonts, external links, forms, and filesystem access are unavailable. Accessibility Help documents these restrictions; ordinary previews do not show a separate limitation row. The repository-local [html-preview skill](../../../../../../../.github/skills/html-preview/SKILL.md) describes the format for visual reports, plans, reviews, comparisons, and mockups when working in this checkout. It is not bundled with the product, and rendering in other workspaces does not require the skill. Existing AI visibility and chat accessibility settings continue to apply; the rendering preference adds no runtime permission or policy.

The preview is an inner content surface with quiet, themed chrome and a keyboard-operable toolbar. **Show Source** uses the existing code editor and its copy actions. **Open Preview** opens an independent, script-disabled editor with Find, Accessibility Help, and an Accessible View of the document text; its reading position survives switching editor tabs. The expanded editor is a snapshot of that response; close it and reopen from chat after a window reload. Chat Accessibility Help documents these actions, and Chat Accessible View retains the original response. Webview failures and blocks over 64,000 UTF-16 code units explicitly fall back to source. The existing overall Markdown rendering limit is unchanged. Inline height is bounded at 600px and 80% of the viewport, with scrolling inside longer content. Containment styling and horizontal overflow belong to the generated preview document, so native horizontal scrollbars contribute to the existing intrinsic content size. The shared webview adds only opt-in wheel forwarding, not preview-specific styling or sizing metadata.

**Save HTML...** asks for a filename and exports the sanitized document, including its restrictive CSP and the current theme variables it actually references. The exported file can be read offline without VS Code. Original scripts, unsupported controls, and external resource attributes are not exported; external CSS resource requests remain blocked by CSP. The original source remains available separately through Show Source. Successful saves open through the existing HTML file-artifact path on desktop, respecting editor associations; other resource schemes and web hosts use the normal editor. Saving does not fabricate an agent-authored artifact registration or send a new prompt. The saved file can be attached to a later chat and revised using normal file tools.

## Try it

Ask an agent to respond using an `html-preview` fence. In this repository, `/html-preview` provides authoring guidance:

> Create a visual implementation plan comparing two approaches. Include a table of contents, a diagram, a small comparison table, and expandable risks. Keep it self-contained without JavaScript or external resources.

For deterministic testing, use this response:

````markdown
Here is the comparison:

```html-preview
<style>
  .options { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .option { border: 1px solid currentColor; border-radius: 6px; padding: 12px; }
</style>
<h2>Choose an approach</h2>
<nav aria-label="Contents"><a href="#options">Options</a> | <a href="#trade-offs">Trade-offs</a></nav>
<div class="options" id="options">
  <section class="option"><h3>Small change</h3><p>Reuse the existing renderer.</p></section>
  <section class="option"><h3>Separate runtime</h3><p>Needed for interactive applications.</p></section>
</div>
<details id="trade-offs"><summary>Trade-offs</summary><p>The smaller change does not execute scripts.</p></details>
```

Both approaches keep generated content separate from the workbench.
````

## Testing scenarios

| Scenario | Expected result | Coverage |
| --- | --- | --- |
| Explicit response preview | HTML/CSS renders inline; Markdown before and after is unchanged; source retains exact original text. | Unit + live UI |
| Rendering preference | Disable `chat.htmlPreview.enabled` before opening a transcript and while it is visible: explicit fences show source, without a preview toolbar or webview. Reenable it to restore previews without a reload. Other chat surfaces remain source-only, and rendering works without the repository skill. | Chat-list unit + live UI |
| Ordinary HTML / user prompt / editor chat | Remains code; no HTML-preview webview is allocated. | Unit |
| Streaming and cancellation | No preview before a real closing fence, including a response stopped mid-block. A completed block may display while the remaining explanation streams. | Unit + live UI |
| Backtick and tilde fences | Matching fences of at least three characters work; short, mismatched, or closing fences indented more than three spaces do not trigger a preview, including for canceled responses. | Unit |
| Append-only response updates | Existing preview and source-toggle state survive; no duplicate webview or source editor. | Unit |
| Multiple previews / restored conversation | Independent previews and toggles; restored Markdown renders again without executing code or needing provider state. | Live UI |
| Preview toolbar | The header and content have no extra limitation row. Tab/Shift+Tab reaches the toolbar; Left/Right moves between actions; Enter/Space activates them. Show Source announces its pressed state and preserves the preview's disclosure state. Errors and oversized-output notices remain visible. | Unit + live UI |
| Code-block navigation | Next/Previous Code Block traverses mixed HTML previews and ordinary code blocks without restarting at the first/last block when preview controls have focus. With Show Source active, navigation focuses its source editor. | Command + content-part unit tests + live UI |
| Expanded preview | Opens in the editor with the same sanitization, script prohibition, and offline CSP. Repeated activation, including after chat-row recycling, reuses the editor for the same block and source. Recycling the chat row does not close it. Find and section navigation work in a long report. Scroll down, switch to another editor tab, then return: the reading position is restored even though the hidden frame was released. | Overlay lifecycle unit + live UI |
| Safe export and reopening | Save a report containing scripts, forms, external URLs, CSS and SVG. Reopen the file offline: supported content and theme remain, including quoted Windows/Linux font families and subsequent theme variables; no script executes and no external content loads. Attach the saved file to a later chat for a revision. | Unit + live browser |
| Export cancellation and errors | Cancel creates no file. Write or editor-open failures surface an error; actions remain retryable and failed expanded editors are disposed. | Unit + live UI |
| Section navigation | A long report's table of contents reaches matching IDs, including encoded spaces. `#` scrolls to the top. Malformed escapes, command/file/external URLs and SVG links do not navigate. | Unit + live browser |
| Accessibility | Chat help documents all actions. Expanded-preview Help and Accessible View apply only while its content is focused, not while chat or the webview Find input is focused. Closing the accessible view restores preview focus only if that editor is still active. The Find hint follows the webview Find command's binding; chat Accessible View keeps original source. Disclosures and section links remain keyboard-operable. | Unit + live command routing + manual screen reader |
| Authoring guidance | This checkout exposes the repository-local `/html-preview` skill; it is not included in the product's built-in skills. An unrelated workspace still renders correctly formatted responses without the skill. | Repository discovery + live UI |
| Layout and themes | Wide/narrow chat, light/dark/high-contrast themes, long output and zoom remain usable; generated CSS cannot affect adjacent messages or chrome. | Unit height bound + live UI |
| Nested scrolling | Wheel gestures inside a scrolling document, nested pane, or horizontal table move only the preview, including at the scroller's edges. Routing accounts for Windows/Linux Shift+wheel and the predominant gesture axis. Short documents still delegate scrolling to chat. A vertical gesture with slight horizontal drift over a horizontal-only pane scrolls chat without also scrolling the pane. The preview-owned overflow wrapper includes non-overlay horizontal scrollbars in its natural height instead of creating a vertical root scroll trap. Move the pointer outside the preview to scroll the transcript while reading a long document. Other webviews retain their existing wheel behavior and content dimensions. | Webview shell + preview-document layout tests + live UI |
| Script / bridge injection | Script elements, event handlers, `javascript:` and `command:` links, and forged webview context cannot execute or invoke VS Code. | Unit + live browser |
| Network / navigation / local files | Remote images, CSS URLs/imports, frames, forms, redirects and file URLs do not load or navigate. Embedded raster images and simple SVG remain supported. | Unit sanitization + live browser CSP |
| Oversized content | At 64,000 code units a preview is allowed; above that the user sees an explicit notice and the original source, with no webview allocated. | Unit |
| Webview failure | Error is logged and announced; source remains available. | Unit |
| Visibility, remount and disposal | Scroll a completed preview fully out of the viewport, let other responses reuse its row, then return repeatedly, including after resizing the chat. Exercise both reconstruction and returning to an older cached part after toggling the same block in a replacement part. The existing bounded output-state cache retains source mode and reserved height per session/response/block; remounting synchronizes the visible mode and pressed state before recreating a webview. Restored source mode defers webview creation until returning to preview, and a failed part stays in its source fallback. Disposing a response releases webview, listeners, and editor-pool reference. | Unit + real chat-list virtualization + live UI |

Focused automated tests are in [chatMarkdownContentPart.test.ts](../../../../../workbench/contrib/chat/test/browser/widget/chatContentParts/chatMarkdownContentPart.test.ts), [chatCodeblockActions.test.ts](../../../../../workbench/contrib/chat/test/browser/actions/chatCodeblockActions.test.ts), [chatListWidget.test.ts](../../../../../workbench/contrib/chat/test/browser/widget/chatListWidget.test.ts), [webviewShellMessaging.test.ts](../../../../../workbench/contrib/webview/test/node/webviewShellMessaging.test.ts), and [sessionsChatAccessibilityHelp.test.ts](./sessionsChatAccessibilityHelp.test.ts). Coverage labels describe which validation to run, not a claim that every manual scenario has been executed.

```bash
pnpm run build-fast --client-only
./scripts/test.sh --run src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatMarkdownContentPart.test.ts --run src/vs/workbench/contrib/chat/test/browser/actions/chatCodeblockActions.test.ts --run src/vs/workbench/contrib/webview/test/node/webviewShellMessaging.test.ts --run src/vs/sessions/contrib/chat/test/browser/sessionsChatAccessibilityHelp.test.ts
./scripts/test.sh --run src/vs/workbench/contrib/chat/test/browser/widget/chatListWidget.test.ts --grep "HTML preview|HTML webviews"
```
