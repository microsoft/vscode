# Markdown code block editor extensions

> **Experimental:** This extension contribution is under development and may
> change before it becomes a stable VS Code extension API.

Extensions can replace fenced Markdown code blocks with iframe-backed editors
in VS Code's Markdown editor. The iframe edits the code block body; the
surrounding fence and its info string remain part of the Markdown document.

For example, an extension can turn:

````markdown
```diagram theme=dark
{"nodes":[],"edges":[]}
```
````

into a visual diagram editor while keeping the JSON between the fences as the
document source.

## Architecture

The integration has three parts:

1. The extension manifest selects the fenced code blocks it handles.
2. The extension optionally resolves the HTML used for each document and info
   string.
3. A self-contained browser guest uses `@vscode/web-editors` to synchronize the
   code block body with the Markdown editor.

The Markdown editor virtualizes guest iframes. A guest must therefore derive
all persistent state from the code block content or another explicit store and
must tolerate being disposed and recreated.

## Contribute a static editor

Use a static provider when every matching block uses the same HTML:

```json
{
  "contributes": {
    "markdown.codeBlockEditorProviders": [
      {
        "id": "diagram",
        "selector": {
          "language": "diagram"
        },
        "source": {
          "kind": "static",
          "entrypoint": "./dist/diagram-editor.html"
        },
        "contentType": "json",
        "initialHeight": 360,
        "sandbox": {
          "forms": false,
          "downloads": false,
          "pointerLock": false,
          "clipboardWrite": false
        }
      }
    ]
  }
}
```

The entrypoint is relative to the extension root. The HTML must be
self-contained because the Markdown editor reads it and uses it as iframe
content. Inline scripts and styles or a single-file HTML bundle are suitable;
relative script and stylesheet references are not.

## Select code blocks

A selector uses exactly one of these properties:

- `language` matches the first language token exactly.
- `languagePrefix` matches the beginning of the first language token.

The info string is all text after the opening fence. For
<code>```diagram theme=dark</code>, it is `diagram theme=dark`, not only
`diagram`, while the language token is `diagram`.

Use an exact selector for one language. It also matches blocks that have
additional info-string metadata:

```json
{ "language": "diagram" }
```

Use a prefix selector for a family of languages:

```json
{ "languagePrefix": "diagram-" }
```

If more than one provider matches a language, the Markdown editor reports
the ambiguity and does not choose between them.

## Contribute a dynamically resolved editor

Use a dynamic provider when the HTML depends on the document URI, info-string
parameters, extension settings, or another resource:

```json
{
  "contributes": {
    "markdown.codeBlockEditorProviders": [
      {
        "id": "diagram",
        "selector": {
          "language": "diagram"
        },
        "source": {
          "kind": "exportApi",
          "apiVersion": 1
        },
        "contentType": "json",
        "initialHeight": 360,
        "sandbox": {
          "forms": false,
          "downloads": false,
          "pointerLock": false,
          "clipboardWrite": false
        }
      }
    ]
  }
}
```

Dynamic providers are resolved only in trusted workspaces.

### Export API V1

The extension's `activate` function returns a
`markdownCodeBlockEditors.apiV1` object:

```ts
import * as vscode from 'vscode';

interface MarkdownCodeBlockEditorApiV1 {
	getProvider(providerId: string): MarkdownCodeBlockEditorProvider | undefined;
}

interface MarkdownCodeBlockEditorProvider {
	readonly onDidChange: vscode.Event<void>;

	resolve(
		request: {
			readonly providerId: string;
			readonly documentUri: vscode.Uri;
			readonly infoString: string;
		},
		token: vscode.CancellationToken,
	): vscode.ProviderResult<ResolvedMarkdownCodeBlockEditor>;
}

interface ResolvedMarkdownCodeBlockEditor {
	readonly content:
		| { readonly html: string }
		| { readonly uri: vscode.Uri };
	readonly contentType?: 'text' | 'json';
	readonly initialHeight?: number;
	readonly sandbox?: {
		readonly forms?: boolean;
		readonly downloads?: boolean;
		readonly pointerLock?: boolean;
		readonly clipboardWrite?: boolean;
	};
}

interface ExtensionApi {
	readonly markdownCodeBlockEditors: {
		readonly apiV1: MarkdownCodeBlockEditorApiV1;
	};
}
```

Return this API from activation:

```ts
export function activate(context: vscode.ExtensionContext): ExtensionApi {
	const diagramProvider = createDiagramProvider(context);

	return {
		markdownCodeBlockEditors: {
			apiV1: {
				getProvider: providerId =>
					providerId === 'diagram' ? diagramProvider : undefined,
			},
		},
	};
}
```

The ID passed to `getProvider` is the manifest contribution's `id`, not the
fully qualified extension ID.

### Resolve an editor

The provider may return HTML directly or a URI for a UTF-8 HTML file inside the
extension or workspace:

```ts
function createDiagramProvider(
	context: vscode.ExtensionContext,
): MarkdownCodeBlockEditorProvider {
	const onDidChange = new vscode.EventEmitter<void>();
	context.subscriptions.push(onDidChange);
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('example.diagram')) {
			onDidChange.fire();
		}
	}));

	return {
		onDidChange: onDidChange.event,

		async resolve(request, token) {
			const html = await createEditorHtml({
				documentUri: request.documentUri,
				infoString: request.infoString,
			});
			if (token.isCancellationRequested) {
				return undefined;
			}

			return {
				content: { html },
				contentType: 'json',
				initialHeight: 360,
			};
		},
	};
}
```

The Markdown editor caches a successful resolution by provider, document URI,
and complete info string. Fire `onDidChange` whenever a setting or external
resource can change a previously resolved descriptor. This drops the cached
resolutions and recreates mounted editors. The provider does not construct or
manage cache keys.

Check the cancellation token after every asynchronous operation. Resolution is
also subject to a host timeout.

`contentType`, `initialHeight`, and `sandbox` in the resolved value override the
manifest defaults. Requested sandbox capabilities are intersected with the
manifest declaration, so the resolved value cannot acquire permissions that
the extension did not declare.

## Build the browser guest

Install `@vscode/web-editors` in the extension and build a separate browser
entrypoint. The guest connects to its parent iframe host:

```ts
import { WebEditorClient } from '@vscode/web-editors';

async function main(): Promise<void> {
	const input = document.querySelector<HTMLTextAreaElement>('#value');
	if (!input) {
		throw new Error('Missing editor input');
	}

	const client = await WebEditorClient.connect({
		connection: 'windowParent',
		contentType: 'text',
	});

	let renderedText = asText(client.getContent());
	let readOnly = client.getReadOnly();
	input.value = renderedText;
	input.disabled = readOnly;

	const contentSubscription = client.onDidChangeContent(({ content }) => {
		const text = asText(content);
		if (text === renderedText) {
			return;
		}
		renderedText = text;
		input.value = text;
	});

	const readOnlySubscription = client.onDidChangeReadOnly(event => {
		readOnly = event.readOnly;
		input.disabled = readOnly;
	});

	input.addEventListener('input', () => {
		if (readOnly) {
			return;
		}
		renderedText = input.value;
		client.applyEdits([{
			kind: 'replace',
			path: [],
			newValue: renderedText,
		}]);
	});

	const reportSize = () => client.reportSize(
		document.documentElement.scrollHeight,
	);
	const resizeObserver = new ResizeObserver(reportSize);
	resizeObserver.observe(document.documentElement);
	reportSize();

	window.addEventListener('pagehide', () => {
		resizeObserver.disconnect();
		contentSubscription.dispose();
		readOnlySubscription.dispose();
		client.dispose();
	}, { once: true });
}

function asText(content: unknown): string {
	return typeof content === 'string' ? content : '';
}

void main().catch(error => {
	document.body.textContent = error instanceof Error ? error.message : String(error);
});
```

For `contentType: "text"`, content and whole-document replacement values are
strings. For `contentType: "json"`, the client receives parsed JSON values and
replacement values must also be JSON values.

`applyEdits` updates the client's local content synchronously and forwards the
edit to the host. The host broadcasts canonical content back through
`onDidChangeContent`. Ignore identical self-echoes so a focused input is not
rebuilt and does not lose its caret or selection.

Read the initial read-only state with `getReadOnly()` and subscribe to
`onDidChangeReadOnly`. Disable every mutation path while read-only, including
keyboard shortcuts and messages from nested applications.

Call `reportSize` after the initial render and when the desired height changes.
The Markdown editor uses this value to size the iframe and preserve its layout
while virtualizing editors.

Dispose the `WebEditorClient`, event subscriptions, observers, and application
resources when the iframe unloads.

## Bundle self-contained HTML

The guest runs in a browser, not the extension host. Build it with a browser
target and include it in the packaged extension.

When the dynamic provider embeds a JavaScript bundle into generated HTML, emit
one bundle chunk and escape closing script tags:

```ts
function createEditorHtml(bundle: string): string {
	const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<style>
		html, body { margin: 0; }
		body {
			background: var(--vscode-editor-background);
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
		}
	</style>
</head>
<body>
	<textarea id="value"></textarea>
	<script>${safeBundle}</script>
</body>
</html>`;
}
```

VS Code theme variables are made available to the guest. Use them instead of
hard-coded colors.

## Security and nested applications

- Request only the sandbox capabilities the editor needs.
- Treat the code block content and info string as untrusted input.
- Escape values inserted into generated HTML.
- Validate `message` event sources and origins when embedding another iframe.
- Add explicit connection and initialization error states instead of leaving a
  permanent loading indicator.
- Do not depend on same-origin storage or access to the parent document.

## Compatibility

The `apiVersion` is the major version of the extension export contract.
Backward-compatible additions to V1 are optional. Breaking changes use a
sibling export such as `apiV2`; an extension may expose multiple versions at
the same time.
