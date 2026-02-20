/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';

const VIEW_TYPE = 'markdownWysiwyg.editor';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(MarkdownWysiwygEditorProvider.register(context));
}

export function deactivate(): void { }

class MarkdownWysiwygEditorProvider implements vscode.CustomTextEditorProvider {
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MarkdownWysiwygEditorProvider(context);
		return vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider);
	}

	constructor(private readonly context: vscode.ExtensionContext) { }

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		const documentDir = vscode.Uri.joinPath(document.uri, '..');

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
				documentDir
			]
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, documentDir);

		const updateWebview = () => {
			void webviewPanel.webview.postMessage({
				type: 'update',
				text: document.getText()
			});
		};

		let isUpdating = false;

		const messageListener = webviewPanel.webview.onDidReceiveMessage(async message => {
			switch (message.type) {
				case 'webviewError': {
					const detail = String(message.message ?? '').trim();
					const messageText = detail
						? vscode.l10n.t('Markdown editor failed to load: {0}', detail)
						: vscode.l10n.t('Markdown editor failed to load.');
					void vscode.window.showErrorMessage(messageText);
					return;
				}
				case 'ready': {
					const baseDir = getDocumentBasePath(document.uri);
					void webviewPanel.webview.postMessage({
						type: 'basePath',
						basePath: baseDir
					});
					updateWebview();
					return;
				}
				case 'update': {
					const newText = String(message.text ?? '');
					if (newText === document.getText()) {
						return;
					}
					isUpdating = true;
					try {
						await replaceDocumentText(document, newText);
					} finally {
						isUpdating = false;
					}
					return;
				}
				case 'openFilePicker': {
					const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
					const defaultUri = workspaceFolder?.uri ?? document.uri;
					const selection = await vscode.window.showOpenDialog({
						canSelectFiles: true,
						canSelectFolders: false,
						canSelectMany: false,
						defaultUri
					});
					const picked = selection?.[0];
					if (!picked) {
						return;
					}
					const relative = computeRelativePath(document.uri, picked);
					void webviewPanel.webview.postMessage({
						type: 'filePicked',
						path: relative
					});
					return;
				}
				case 'openLink': {
					const href = String(message.href ?? '').trim();
					if (!href) {
						return;
					}
					try {
						const linkTarget = resolveLinkTarget(document.uri, href, vscode.workspace.workspaceFolders);
						if (linkTarget.isExternal && linkTarget.uri) {
							await vscode.env.openExternal(linkTarget.uri);
							return;
						}
						if (!linkTarget.isExternal && linkTarget.uri) {
							await vscode.commands.executeCommand('vscode.openWith', linkTarget.uri, VIEW_TYPE, {
								preview: true
							});
						}
					} catch {
						// Ignore invalid URIs.
					}
					return;
				}
			}
		});

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() !== document.uri.toString()) {
				return;
			}
			if (isUpdating) {
				return;
			}
			updateWebview();
		});

		webviewPanel.onDidDispose(() => {
			messageListener.dispose();
			changeDocumentSubscription.dispose();
		});
	}

	private getHtmlForWebview(webview: vscode.Webview, documentDir: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css'));
		const showdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'showdown.min.js'));
		const turndownUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'turndown.js'));
		const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid.min.js'));
		const mermaidEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid-editor.js'));
		const baseUri = webview.asWebviewUri(documentDir).toString();
		const baseHref = baseUri.endsWith('/') ? baseUri : `${baseUri}/`;
		const nonce = getNonce();
		return buildWebviewHtml({
			scriptUri: scriptUri.toString(),
			styleUri: styleUri.toString(),
			showdownUri: showdownUri.toString(),
			turndownUri: turndownUri.toString(),
			mermaidUri: mermaidUri.toString(),
			mermaidEditorUri: mermaidEditorUri.toString(),
			baseHref,
			nonce,
			cspSource: webview.cspSource
		});
	}
}

function buildWebviewHtml(options: {
	scriptUri: string;
	styleUri: string;
	showdownUri: string;
	turndownUri: string;
	mermaidUri: string;
	mermaidEditorUri: string;
	baseHref: string;
	nonce: string;
	cspSource: string;
}): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} https: data:; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<base href="${options.baseHref}">
	<link href="${options.styleUri}" rel="stylesheet">
	<title>Markdown WYSIWYG Editor</title>
</head>
<body>
	<div class="toolbar" role="toolbar" aria-label="Markdown editor toolbar">
		<button data-command="bold" title="Bold"><strong>B</strong></button>
		<button data-command="italic" title="Italic"><em>I</em></button>
		<button data-command="h1" title="Heading 1">H1</button>
		<button data-command="h2" title="Heading 2">H2</button>
		<button data-command="ul" title="Bulleted list">• List</button>
		<button data-command="ol" title="Numbered list">1. List</button>
		<button data-command="code" title="Inline code">Code</button>
		<button data-command="codeBlock" title="Code block">Code Block</button>
		<button data-command="link" title="Insert link">Link</button>
		<button data-command="image" title="Insert image">Image</button>
		<button data-command="mermaid" title="Insert Mermaid diagram">Mermaid</button>
		<button data-command="toggleSource" title="Show source pane">Show Source</button>
	</div>
	<div class="editor-shell">
		<div id="editor" class="editor" contenteditable="true" spellcheck="true" aria-label="Markdown editor"></div>
		<div class="source-pane" aria-label="Markdown source">
			<div class="source-title">Markdown Source</div>
			<textarea id="source" class="source" spellcheck="false"></textarea>
		</div>
	</div>
	<script nonce="${options.nonce}" src="${options.showdownUri}"></script>
	<script nonce="${options.nonce}" src="${options.turndownUri}"></script>
	<script nonce="${options.nonce}" src="${options.mermaidUri}"></script>
	<script nonce="${options.nonce}" src="${options.mermaidEditorUri}"></script>
	<script nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
	const edit = new vscode.WorkspaceEdit();
	const start = new vscode.Position(0, 0);
	const lastLine = document.lineCount > 0 ? document.lineAt(document.lineCount - 1) : undefined;
	const end = lastLine ? lastLine.range.end : new vscode.Position(0, 0);
	edit.replace(document.uri, new vscode.Range(start, end), text);
	await vscode.workspace.applyEdit(edit);
}

function computeRelativePath(documentUri: vscode.Uri, pickedUri: vscode.Uri): string {
	const baseDir = path.dirname(documentUri.fsPath);
	let relative = path.relative(baseDir, pickedUri.fsPath);
	if (!relative || relative === '.') {
		relative = path.basename(pickedUri.fsPath);
	}
	relative = relative.replace(/\\/g, '/');
	if (!relative.startsWith('.') && !relative.startsWith('/')) {
		relative = `./${relative}`;
	}
	return relative;
}

function getDocumentBasePath(documentUri: vscode.Uri): string {
	return vscode.Uri.joinPath(documentUri, '..').fsPath;
}

function isExternalLink(href: string): boolean {
	return /^https?:/i.test(href) || /^mailto:/i.test(href);
}

function resolveLinkTarget(
	documentUri: vscode.Uri,
	href: string,
	workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): { isExternal: boolean; uri?: vscode.Uri } {
	if (isExternalLink(href)) {
		return { isExternal: true, uri: vscode.Uri.parse(href, true) };
	}

	// In-document anchor (e.g. "#section")
	if (href.startsWith('#')) {
		return { isExternal: false, uri: documentUri.with({ fragment: href.substring(1) }) };
	}

	let hrefUri: vscode.Uri | undefined;
	try {
		hrefUri = vscode.Uri.parse(href, true);
	} catch {
		hrefUri = undefined;
	}

	const baseUri = vscode.Uri.joinPath(documentUri, '..');

	// Fallback to previous behavior if parsing failed
	if (!hrefUri) {
		const fallbackTargetUri = href.startsWith('/')
			? (workspaceFolders?.[0]
				? vscode.Uri.joinPath(workspaceFolders[0].uri, href.substring(1))
				: vscode.Uri.file(href))
			: vscode.Uri.joinPath(baseUri, href);

		return { isExternal: false, uri: fallbackTargetUri };
	}

	const pathPart = hrefUri.path;
	const fragment = hrefUri.fragment;
	const query = hrefUri.query;

	let resolvedPathUri: vscode.Uri;

	if (pathPart && pathPart.startsWith('/')) {
		const absPath = pathPart.substring(1);
		resolvedPathUri = workspaceFolders?.[0]
			? vscode.Uri.joinPath(workspaceFolders[0].uri, absPath)
			: vscode.Uri.file(pathPart);
	} else if (pathPart && pathPart.length > 0) {
		resolvedPathUri = vscode.Uri.joinPath(baseUri, pathPart);
	} else {
		// No path component: refer to the current document
		resolvedPathUri = documentUri;
	}

	const targetUri = resolvedPathUri.with({
		fragment: fragment || undefined,
		query: query || undefined
	});
	return { isExternal: false, uri: targetUri };
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
