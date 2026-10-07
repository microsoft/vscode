/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { HubRpcConnection } from '@vscode/hubrpc';
import { MarkdownContributions } from '../markdownExtensions';
import { MarkdownEditorProvider } from '../preview/markdownEditorProvider';
import { markdownEditorHost, markdownEditorRenderer } from '../preview/markdownEditorProtocol';
import { MarkdownEditorRpcTransport } from '../preview/markdownEditorRpc';
import { MdLinkOpener } from '../util/openDocumentLink';

suite('Markdown editor bridge', () => {
	test('resynchronizes the ready race and rejects stale edits while preserving CRLF sequential edits', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'initial\r\ncontent' });
		const initialVersion = document.version;
		const panel = new TestPanel();
		const state = new TestMemento();
		const extensionUri = vscode.extensions.getExtension('vscode.markdown-language-features')!.extensionUri;
		const provider = new MarkdownEditorProvider(
			extensionUri, state,
			new MdLinkOpener({ resolveLinkTarget: async () => undefined }),
			{
				extensionUri,
				contributions: MarkdownContributions.Empty,
				onContributionsChanged: () => new vscode.Disposable(() => { }),
				dispose: () => { },
			},
			{ trace: () => { } },
			async () => false,
		);
		const cancellation = new vscode.CancellationTokenSource();
		let renderer: HubRpcConnection<undefined> | undefined;
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const secret = /name="vscode-markdown-editor-message-secret" content="([^"]+)"/.exec(panel.webview.html)?.[1];
			assert.ok(secret);
			await replaceDocument(document, 'changed\r\nbefore-ready');
			assert.strictEqual(panel.webview.sent.length, 0, 'do not start requests before the renderer is listening');
			renderer = HubRpcConnection.fromTransport(new MarkdownEditorRpcTransport(
				secret,
				message => panel.webview.incoming.fire(message),
				listener => panel.webview.outgoing.event(listener),
			));
			const updates: { content: string; editEpoch: number }[] = [];
			let updated: (() => void) | undefined;
			renderer.register(markdownEditorRenderer, {
				update: update => { updates.push(update); updated?.(); },
				codeBlockEditorProviders: () => { },
				codeBlockEditorHostTransportMessage: () => { },
				gutterMarkers: () => { },
				comments: () => { },
				revealComment: () => { },
				revealLinkTarget: () => { },
				command: () => { },
				highlightThemeChanged: () => { },
				richLinkPresentations: () => { },
			});
			const host = renderer.get(markdownEditorHost);
			await host.ready({ documentVersion: initialVersion, editEpoch: 0 });
			assert.strictEqual(updates.length, 1);
			assert.strictEqual(updates[0].content, 'changed\r\nbefore-ready');
			const epoch = updates[0].editEpoch;
			assert.ok(epoch > 0);
			await host.edit({ start: 0, endExclusive: 0, text: 'stale', editEpoch: 0 });
			assert.strictEqual(document.getText(), 'changed\r\nbefore-ready');
			await host.edit({ start: 0, endExclusive: 0, text: '\n', editEpoch: epoch });
			await host.edit({ start: 1, endExclusive: 1, text: 'x', editEpoch: epoch });
			assert.strictEqual(document.getText(), '\r\nxchanged\r\nbefore-ready');
			assert.strictEqual(updates.length, 1, 'accepted local edits must not echo authoritative replacements');
			const externalUpdate = new Promise<void>(resolve => updated = resolve);
			await replaceDocument(document, 'external\r\n');
			await externalUpdate;
			await host.edit({ start: 0, endExclusive: 0, text: 'stale-again', editEpoch: epoch });
			await host.setReadonly({ readonly: false });
			assert.deepStrictEqual({
				document: document.getText(),
				mirror: updates[1].content,
				epochAdvanced: updates[1].editEpoch > epoch,
				mode: Array.from(state.values),
			}, {
				document: 'external\r\n',
				mirror: 'external\r\n',
				epochAdvanced: true,
				mode: [['markdown.editor.readonly', false]],
			});
		} finally {
			panel.dispose();
			renderer?.close();
			provider.dispose();
			cancellation.dispose();
		}
	});
});

async function replaceDocument(document: vscode.TextDocument, content: string): Promise<void> {
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), content);
	assert.ok(await vscode.workspace.applyEdit(edit));
}

class TestPanel implements vscode.WebviewPanel {
	readonly viewType = MarkdownEditorProvider.viewType;
	title = 'RPC test';
	readonly webview = new TestWebview();
	readonly options = {};
	readonly viewColumn = undefined;
	readonly active = true;
	readonly visible = true;
	readonly #dispose = new vscode.EventEmitter<void>();
	readonly onDidDispose = this.#dispose.event;
	readonly onDidChangeViewState: vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> = () => new vscode.Disposable(() => { });
	reveal(): void { }
	dispose(): void {
		this.#dispose.fire();
		this.#dispose.dispose();
		this.webview.incoming.dispose();
		this.webview.outgoing.dispose();
	}
}

class TestWebview implements vscode.Webview {
	options: vscode.WebviewOptions = {};
	html = '';
	readonly cspSource = 'test:';
	readonly incoming = new vscode.EventEmitter<unknown>();
	readonly outgoing = new vscode.EventEmitter<unknown>();
	readonly onDidReceiveMessage = this.incoming.event;
	readonly sent: unknown[] = [];
	async postMessage(message: unknown): Promise<boolean> {
		this.sent.push(message);
		this.outgoing.fire(JSON.parse(JSON.stringify(message)));
		return true;
	}
	asWebviewUri(uri: vscode.Uri): vscode.Uri {
		return uri;
	}
}

class TestMemento implements vscode.Memento {
	readonly values = new Map<string, unknown>();
	keys(): readonly string[] { return [...this.values.keys()]; }
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(_key: string, defaultValue?: T): T | undefined { return defaultValue; }
	async update(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}
}
