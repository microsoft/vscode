# HTML response previews

## Investigation

- [Claude custom visuals in chat and Cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork) are generated HTML rendered inline, distinct from persistent artifacts. They can support charts, diagrams, comparisons, and interactive controls.
- [ChatGPT code blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt) separate Code from Preview, render supported HTML and other formats in a sandbox, and can request permission for outside resources.
- [ChatGPT Intelligent UI](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt) also composes text, visuals, and interactive elements directly in responses. Its public documentation describes behavior, not an implementation protocol to reuse.
- [Claude Code: The unreasonable effectiveness of HTML](https://claude.dev/blog/using-claude-code-the-unreasonable-effectiveness-of-html/) emphasizes navigable reports, plans, reviews, and reusable files. The larger reading surface, fragment links, sanitized export, and authoring skill support that workflow; its JavaScript-driven editors remain outside this static preview's scope.

The reusable pattern is an explicit content boundary plus an isolated renderer, not relaxing Markdown sanitization. These sources document product behavior; they do not establish the vendors' private rendering or sandbox implementations.

## Implemented scope

The Agents window opts into a shared chat renderer for **explicit, closed `html-preview` fenced blocks in assistant responses**. The `chat.htmlPreview.enabled` setting defaults to `false`, so these blocks display as source code until it is enabled; changing it updates existing responses without reloading. Previously opened expanded editors remain independent snapshots. Ordinary `html` fences, user messages, raw HTML outside a fence, annotated file edits, and other chat surfaces keep their existing behavior. Providers do not need a new protocol response type: the original Markdown remains the persisted, copied, exported, and accessible response.

The preview displays sanitized HTML, CSS, simple inline SVG, embedded PNG/JPEG/GIF/WebP images, native `details`/`summary` disclosures, and links to sections within the document. Fragment-only HTML anchors are normalized; malformed fragments, external navigation, and SVG links are removed. IDs that collide with document/form properties are namespaced along with fragment, ARIA, CSS and SVG references, preserving DOM-clobbering protections. Each preview uses a script-disabled VS Code webview with no local resource roots or service worker, disabled forms and command URIs, and a restrictive Content Security Policy. Active markup, foreign SVG content, and webview context attributes are removed. CSS is confined to the webview and cannot style the workbench. Network resources are blocked, including CSS imports and remote images.

This is deliberately **not an arbitrary JavaScript/React app runtime**. Scripts, external libraries, fonts, external links, forms, and filesystem access are unavailable. Accessibility Help documents these restrictions; ordinary previews do not show a separate limitation row. The built-in [html-preview skill](../../../../skills/html-preview/SKILL.md) provides on-demand authoring guidance for visual reports, plans, reviews, comparisons, and mockups in any workspace. Its discovery, slash-command availability, and harness forwarding follow `chat.htmlPreview.enabled` and `chat.disableAIFeatures`, including live changes. Existing customization disablement is preserved; same-named user/workspace skills retain their normal precedence. The renderer does not require the skill to be invoked, and its instructions are not injected into every turn. Existing AI visibility and chat accessibility settings continue to apply; the rendering preference adds no runtime permission or policy.

Inline previews blend into the response with no title bar, permanent buttons, border, or default background. Their typography follows chat, their default document padding is zero, and authored inner surfaces are preserved. Right-click or focus the preview and press Shift+F10 to open its context menu. **Show Source** uses the existing code editor and its copy actions. Transcript Find searches original HTML and reveals matching source without taking focus; it excludes preview controls from response-match locations. **Open Preview** opens an independent, script-disabled editor with Find, Accessibility Help, and an Accessible View of the document text; its reading position survives switching editor tabs. Expanded and exported documents retain their own background and padding. The expanded editor is a snapshot of that response; close it and reopen from chat after a window reload. Chat Accessibility Help documents these actions, and Chat Accessible View retains the original response. Webview failures and blocks over 64,000 UTF-16 code units explicitly fall back to source. The existing overall Markdown rendering limit is unchanged. Inline previews grow to their full content height, without a maximum height or custom scroll containment, and scroll with the transcript using standard webview wheel forwarding. Authored content remains directly under `body`, preserving grid/flex layouts and expanded-editor sticky positioning. An opt-in webview measurement rounds up natural height and includes horizontal scrollbar space using the existing height message, without new size fields or changes to other webviews' dimensions.

**Save HTML...** asks for a filename and exports the sanitized document, including its restrictive CSP and the current theme variables it actually references. The exported file can be read offline without VS Code. Original scripts, unsupported controls, and external resource attributes are not exported; external CSS resource requests remain blocked by CSP. The original source remains available separately through Show Source. Successful saves open through the existing HTML file-artifact path on desktop, respecting editor associations; other resource schemes and web hosts use the normal editor. Saving does not fabricate an agent-authored artifact registration or send a new prompt. The saved file can be attached to a later chat and revised using normal file tools.

## Try it

Enable `chat.htmlPreview.enabled`, then ask an agent to respond using an `html-preview` fence, or invoke the built-in `/html-preview` skill when it is enabled for your agent:

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
| Rendering preference | Leave `chat.htmlPreview.enabled` at its default (`false`), or disable it while a transcript is visible: explicit fences show source, without a preview or webview. Enable it to render previews without a reload. Other chat surfaces remain source-only, and rendering works without invoking the skill. | Chat-list unit + live UI |
| Ordinary HTML / user prompt / editor chat | Remains code; no HTML-preview webview is allocated. | Unit |
| Streaming and cancellation | No preview before a real closing fence, including a response stopped mid-block. A completed block may display while the remaining explanation streams. | Unit + live UI |
| Backtick and tilde fences | Matching fences of at least three characters work; short, mismatched, or closing fences indented more than three spaces do not trigger a preview, including for canceled responses. | Unit |
| Append-only response updates | Existing preview and source-toggle state survive; no duplicate webview or source editor. | Unit |
| Multiple previews / restored conversation | Independent previews and toggles; restored Markdown renders again without executing code or needing provider state. | Live UI |
| Preview actions | There is no header, permanent toolbar, border, or separate background. Tab/Shift+Tab reaches the labeled preview; Shift+F10 or right-click opens its menu; arrows and Enter activate actions. Show Source announces its checked state, moves focus to the selected view, and preserves the preview's disclosure state. Errors and oversized-output notices remain visible. Source mode retains standard editor context actions. | Unit + live UI |
| Code-block navigation | Next/Previous Code Block traverses mixed HTML previews and ordinary code blocks without restarting at the first/last block when a preview has focus. With Show Source active, navigation focuses its source editor. | Command + content-part unit tests + live UI |
| Transcript Find | Search for content inside a preview: source opens, the matching editor line is visible, and Find retains focus. Search for prose containing toolbar labels such as "Show Source": the prose is highlighted, not preview chrome, and unrelated previews stay in preview mode. | Real chat-list/Find integration + live UI |
| Expanded preview | Opens in the editor with the same sanitization, script prohibition, and offline CSP. Repeated activation, including after chat-row recycling, reuses the editor for the same block and source. Recycling the chat row does not close it. Find and section navigation work in a long report. Scroll down, switch to another editor tab, then return: the reading position is restored even though the hidden frame was released. | Overlay lifecycle unit + live UI |
| Safe export and reopening | Save a report containing scripts, forms, external URLs, CSS and SVG. Reopen the file offline: supported content and theme remain, including quoted Windows/Linux font families and subsequent theme variables; no script executes and no external content loads. Attach the saved file to a later chat for a revision. | Unit + live browser |
| Export cancellation and errors | Cancel creates no file. Write or editor-open failures surface an error; actions remain retryable and failed expanded editors are disposed. | Unit + live UI |
| Section navigation | A long report's table of contents reaches matching IDs, including encoded spaces and document/form names such as `title`, `timeline`, and `implementation`. Namespaced IDs keep ARIA references, CSS ID selectors and SVG fragment paints/markers consistent, without collisions with already-prefixed IDs. `#` scrolls to the top. Malformed escapes, command/file/external URLs and SVG links do not navigate. | Unit + live browser |
| Accessibility | Chat help documents all actions. Expanded-preview Help and Accessible View apply only while its content is focused, not while chat or the webview Find input is focused. Closing the accessible view restores preview focus only if that editor is still active. The Find hint follows the webview Find command's binding; chat Accessible View keeps original source. Disclosures and section links remain keyboard-operable. | Unit + live command routing + manual screen reader |
| Authoring guidance | The built-in `/html-preview` skill is not offered by default, because previews are off by default. An unrelated workspace offers it while HTML previews and AI features are enabled. Toggle either setting: discovery, slash commands, file listings and harness forwarding update without reloading. User-disabled skills stay disabled after toggling rendering; user/workspace overrides remain preferred. Guidance uses theme variables, transparent outer surfaces and accessible static content. | Built-in discovery + harness sync tests + packaged-resource verification |
| Layout and themes | Wide/narrow chat, light/dark/high-contrast themes, long output and zoom remain usable; generated CSS cannot affect adjacent messages or chrome. Body-owned grid/flex children keep their layout, and sticky navigation in the expanded editor follows the document scroll rather than an artificial overflow wrapper. | Unit height/layout tests + live UI |
| Full-height scrolling | A report taller than 600px and the viewport renders at its full measured height, with no vertical preview scrollbar. Scrolling over it scrolls the transcript. Resizing, native disclosures and forced 125%/150% display scales do not clip the final content. Horizontal scrollbar space contributes to natural height. No special wheel routing or containment is added for authored nested scroll areas. | Real preview layout + forced-scale browser checks + live UI |
| Iframe lifecycle | Hiding or virtualizing a preview disposes its webview before reattachment. Repeated hide/show, recycle and editor-tab cycles do not accumulate frames or mount listeners. Shell navigation is configured before insertion; sandbox flags and request-origin checks remain intact. Unsupported network permission names are not delegated. | Lifecycle/listener regressions + live repeated-cycle and console checks |
| Script / bridge injection | Script elements, event handlers, `javascript:` and `command:` links, and forged webview context cannot execute or invoke VS Code. | Unit + live browser |
| Network / navigation / local files | Remote images, CSS URLs/imports, frames, forms, redirects and file URLs do not load or navigate. Embedded raster images and simple SVG remain supported. | Unit sanitization + live browser CSP |
| Oversized content | At 64,000 code units a preview is allowed; above that the user sees an explicit notice and the original source, with no webview allocated. | Unit |
| Webview failure | Error is logged and announced; source remains available. | Unit |
| Visibility, remount and disposal | Scroll a completed preview fully out of the viewport, let other responses reuse its row, then return repeatedly, including after resizing the chat. Exercise both reconstruction and returning to an older cached part after toggling the same block in a replacement part. The existing bounded output-state cache retains source mode and reserved height per session/response/block; remounting synchronizes the visible mode and menu checked state before recreating a webview. Restored source mode defers webview creation until returning to preview, and a failed part stays in its source fallback. Disposing a response releases webview, listeners, and editor-pool reference. | Unit + real chat-list virtualization + live UI |

Focused automated tests are in [chatMarkdownContentPart.test.ts](../../../../../workbench/contrib/chat/test/browser/widget/chatContentParts/chatMarkdownContentPart.test.ts), [chatCodeblockActions.test.ts](../../../../../workbench/contrib/chat/test/browser/actions/chatCodeblockActions.test.ts), [chatListWidget.test.ts](../../../../../workbench/contrib/chat/test/browser/widget/chatListWidget.test.ts), [webviewShellMessaging.test.ts](../../../../../workbench/contrib/webview/test/node/webviewShellMessaging.test.ts), [sessionsChatAccessibilityHelp.test.ts](./sessionsChatAccessibilityHelp.test.ts), and [appearanceTools.test.ts](./appearanceTools.test.ts). Coverage labels describe which validation to run, not a claim that every manual scenario has been executed.

```bash
pnpm run build-fast --client-only
./scripts/test.sh --run src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatMarkdownContentPart.test.ts --run src/vs/workbench/contrib/chat/test/browser/actions/chatCodeblockActions.test.ts --run src/vs/workbench/contrib/webview/test/node/webviewShellMessaging.test.ts --run src/vs/sessions/contrib/chat/test/browser/sessionsChatAccessibilityHelp.test.ts
./scripts/test.sh --run src/vs/workbench/contrib/chat/test/browser/widget/chatListWidget.test.ts --run src/vs/workbench/contrib/chat/test/browser/widget/chatFindWidget.test.ts --run src/vs/workbench/contrib/chat/test/browser/widget/chatFindModel.test.ts --grep "HTML preview|HTML webviews|ChatFind"
./scripts/test.sh --run src/vs/sessions/contrib/chat/test/browser/appearanceTools.test.ts --run src/vs/workbench/contrib/chat/test/browser/agentSessions/enumerateLocalCustomizationsForHarness.test.ts --run src/vs/workbench/contrib/chat/test/browser/agentSessions/resolveCustomizationRefs.test.ts --grep "Sessions - Appearance tools|enumerateLocalCustomizationsForHarness|resolveCustomizationRefs - built-in skills"
```
