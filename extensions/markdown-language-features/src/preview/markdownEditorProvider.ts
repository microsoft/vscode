/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';

/**
 * Experimental hybrid (WYSIWYG) Markdown editor backed by the
 * `@vscode/markdown-editor` component. The {@link vscode.TextDocument} remains
 * the single source of truth, so native undo/redo, dirty state and hot-exit are
 * preserved.
 */
export class MarkdownEditorProvider extends Disposable implements vscode.CustomTextEditorProvider {

	public static readonly viewType = 'vscode.markdown.editor';

	/**
	 * Memento key under which the last chosen edit/read-only mode is remembered.
	 * The value is a single global default shared by every Markdown editor, so
	 * flipping the lock in one editor becomes the initial mode for the next.
	 */
	static readonly #readonlyStateKey = 'markdown.editor.readonly';

	readonly #mediaRoot: vscode.Uri;
	readonly #extensionUri: vscode.Uri;
	readonly #globalState: vscode.Memento;

	constructor(extensionUri: vscode.Uri, globalState: vscode.Memento) {
		super();
		this.#extensionUri = extensionUri;
		this.#globalState = globalState;
		this.#mediaRoot = vscode.Uri.joinPath(this.#extensionUri, 'markdown-editor-out');
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const webview = webviewPanel.webview;
		webview.options = { enableScripts: true, localResourceRoots: [this.#mediaRoot] };
		webview.html = this.#getHtml(webview);
		this.#wireSingle(document, webviewPanel);
	}

	#wireSingle(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
		const webview = webviewPanel.webview;
		let isUpdatingFromWebview = false;

		const onMessage = webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'ready': {
					webview.postMessage({ type: 'init', content: document.getText(), readonly: this.#globalState.get(MarkdownEditorProvider.#readonlyStateKey, false) });
					break;
				}
				case 'setReadonly': {
					// Remember the edit/read-only choice as the global default for the
					// next Markdown editor.
					await this.#globalState.update(MarkdownEditorProvider.#readonlyStateKey, !!message.readonly);
					break;
				}
				case 'edit': {
					const content = message.content as string;
					if (content === document.getText()) {
						return;
					}
					isUpdatingFromWebview = true;
					const edit = new vscode.WorkspaceEdit();
					edit.replace(
						document.uri,
						new vscode.Range(0, 0, document.lineCount, 0),
						content,
					);
					try {
						await vscode.workspace.applyEdit(edit);
					} finally {
						isUpdatingFromWebview = false;
					}
					break;
				}
			}
		});

		const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() !== document.uri.toString() || isUpdatingFromWebview) {
				return;
			}
			webview.postMessage({ type: 'update', content: document.getText() });
		});

		const highlight = this.#wireHighlight(webview);
		const quickDiff = this.#wireQuickDiff(document, webview);
		const comments = this.#wireComments(document, webview);

		webviewPanel.onDidDispose(() => {
			onMessage.dispose();
			onDocumentChange.dispose();
			highlight.dispose();
			quickDiff.dispose();
			comments.dispose();
		});
	}

	/**
	 * Forwards the source-control change information for the document (the same
	 * added/modified/deleted line changes shown in the editor gutter) to the
	 * webview, where it is painted in the Markdown editor's gutter. Line ranges
	 * are converted to source character offsets here, since the webview works in
	 * offsets.
	 */
	#wireQuickDiff(document: vscode.TextDocument, webview: vscode.Webview): vscode.Disposable {
		const diffProvider = vscode.window.createSourceControlDiffInformation(document.uri);

		const postMarkers = () => {
			const diffInformation = diffProvider.diffInformation;
			// The changes are computed asynchronously against a specific document
			// version. Only map them to offsets while that version still matches the
			// document we hold, otherwise the line positions could be stale. A newer
			// diff for the current version will arrive via onDidChange.
			if (!diffInformation || diffInformation.isStale) {
				return;
			}
			webview.postMessage({ type: 'gutterMarkers', markers: toGutterMarkers(document, diffInformation.changes) });
		};

		const onChange = diffProvider.onDidChange(postMarkers);
		// Re-send once the webview has (re)initialized its model, and whenever the
		// document settles on the version the changes were computed for.
		const onMessage = webview.onDidReceiveMessage((message) => {
			if (message.type === 'ready') {
				postMarkers();
			}
		});
		const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				postMarkers();
			}
		});

		return vscode.Disposable.from(diffProvider, onChange, onMessage, onDocumentChange);
	}

	/**
	 * Bridges the workbench's agent/session comments (the same store the code
	 * editor renders its comments from) to the webview: existing comments are
	 * forwarded for rendering, and comments the user adds in the Markdown editor
	 * are written back to the shared store so they appear in the code editor too.
	 * Comment ranges are converted between {@link vscode.Range} and the source
	 * character offsets the webview works in.
	 */
	#wireComments(document: vscode.TextDocument, webview: vscode.Webview): vscode.Disposable {
		const commentsProvider = vscode.window.createAgentEditorComments(document.uri);

		const postComments = () => {
			const comments = commentsProvider.comments.map(comment => ({
				id: comment.id,
				start: document.offsetAt(comment.range.start),
				endExclusive: document.offsetAt(comment.range.end),
				body: comment.body,
				author: comment.author,
			}));
			webview.postMessage({ type: 'comments', comments });
		};

		const onChange = commentsProvider.onDidChange(postComments);
		const onMessage = webview.onDidReceiveMessage((message) => {
			if (message.type === 'ready') {
				postComments();
			} else if (message.type === 'addComment') {
				const range = new vscode.Range(
					document.positionAt(message.start),
					document.positionAt(message.endExclusive),
				);
				commentsProvider.addComment(range, message.text);
			} else if (message.type === 'deleteComment') {
				commentsProvider.deleteComment(message.id);
			}
		});

		return vscode.Disposable.from(commentsProvider, onChange, onMessage);
	}


	/**
	 * Proxies the webview's syntax highlighting requests to the
	 * `documentSyntaxHighlighting` proposed API, since the webview cannot call
	 * it directly. Also forwards theme changes so the webview can re-highlight.
	 */
	#wireHighlight(webview: vscode.Webview): vscode.Disposable {
		const onMessage = webview.onDidReceiveMessage(async (message) => {
			if (message.type !== 'highlight') {
				return;
			}
			const result = await vscode.languages.computeFullSyntaxHighlighting(message.source, message.languageId);
			webview.postMessage({
				type: 'highlightResult',
				requestId: message.requestId,
				tokens: result.tokens,
				colorMap: result.colorMap,
			});
		});

		const onThemeChange = vscode.languages.onDidChangeSyntaxHighlighting(() => {
			webview.postMessage({ type: 'highlightThemeChanged' });
		});

		return vscode.Disposable.from(onMessage, onThemeChange);
	}

	#getHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.css'));
		const nonce = getNonce();

		const body = /* html */ `
	<div id="editor"></div>`;

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>Markdown Editor</title>
</head>
<body>${body}
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

interface GutterMarkerMessage {
	readonly start: number;
	readonly endExclusive: number;
	readonly type: 'added' | 'modified' | 'deleted';
}

/**
 * Converts the line-based source control changes into source character offset
 * ranges understood by the Markdown editor's `gutterMarkers`. Added/modified
 * changes map to the offset span of their modified lines; deleted changes map to
 * an empty range at the boundary where the removed text used to be.
 *
 * Line ranges use {@link vscode.TextEditorLineRange} semantics: 1-based
 * `startLineNumber` and exclusive `endLineNumberExclusive`.
 */
function toGutterMarkers(document: vscode.TextDocument, changes: readonly vscode.TextEditorChange[]): GutterMarkerMessage[] {
	const markers: GutterMarkerMessage[] = [];
	for (const change of changes) {
		if (change.kind === vscode.TextEditorChangeKind.Deletion) {
			// The modified range is empty; place an empty marker at the start of the
			// line where the removed content used to be.
			const line = Math.max(0, change.modified.startLineNumber - 1);
			const offset = document.offsetAt(new vscode.Position(line, 0));
			markers.push({ start: offset, endExclusive: offset, type: 'deleted' });
			continue;
		}

		const start = document.offsetAt(new vscode.Position(change.modified.startLineNumber - 1, 0));
		const endExclusive = document.offsetAt(document.lineAt(change.modified.endLineNumberExclusive - 2).range.end);
		markers.push({
			start,
			endExclusive,
			type: change.kind === vscode.TextEditorChangeKind.Addition ? 'added' : 'modified',
		});
	}
	return markers;
}
