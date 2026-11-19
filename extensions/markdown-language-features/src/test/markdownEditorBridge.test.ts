/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { HubRpcConnection } from '@vscode/hubrpc';
import { MarkdownContributions } from '../markdownExtensions';
import { MarkdownEditorProvider } from '../preview/markdownEditorProvider';
import { markdownEditorHost, markdownEditorRenderer, type MarkdownEditorRenderer } from '../preview/markdownEditorProtocol';
import { MarkdownEditorRpcTransport } from '../preview/markdownEditorRpc';
import { MdLinkOpener } from '../util/openDocumentLink';

suite('Markdown editor bridge', () => {
	test('resynchronizes the ready race and rejects stale edits while preserving CRLF sequential edits', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'initial\r\ncontent' });
		const initialVersion = document.version;
		const panel = new TestPanel();
		const state = new TestMemento();
		const provider = createProvider(state);
		const cancellation = new vscode.CancellationTokenSource();
		let renderer: HubRpcConnection<undefined> | undefined;
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const secret = /name="vscode-markdown-editor-message-secret" content="([^"]+)"/.exec(panel.webview.html)?.[1];
			assert.ok(secret);
			await replaceDocument(document, 'changed\r\nbefore-ready');
			const navigation = provider.resolveCustomTextEditorNavigation(document, panel, cancellation.token);
			const navigationBeforeReady = navigation.revealRange(new vscode.Range(1, 0, 1, 6), { preserveFocus: true }, cancellation.token);
			assert.strictEqual(panel.webview.sent.length, 0, 'do not start requests before the renderer is listening');
			const connection = connectRenderer(panel, secret);
			renderer = connection.renderer;
			const { host, updates, reveals } = connection;
			await host.ready({ documentVersion: initialVersion, editEpoch: 0 });
			assert.strictEqual(updates.length, 1);
			assert.strictEqual(updates[0].content, 'changed\r\nbefore-ready');
			const epoch = updates[0].editEpoch;
			assert.ok(epoch > 0);
			await navigationBeforeReady;
			assert.deepStrictEqual(reveals, [{
				start: 9, endExclusive: 15, editEpoch: epoch, revision: 0, preserveFocus: true,
			}]);
			await host.edit({ start: 0, endExclusive: 0, text: 'stale', editEpoch: 0 });
			assert.strictEqual(document.getText(), 'changed\r\nbefore-ready');
			await host.edit({ start: 0, endExclusive: 0, text: '\n', editEpoch: epoch });
			await host.edit({ start: 1, endExclusive: 1, text: 'x', editEpoch: epoch });
			assert.strictEqual(document.getText(), '\r\nxchanged\r\nbefore-ready');
			assert.strictEqual(updates.length, 1, 'accepted local edits must not echo authoritative replacements');
			await host.selectionChanged({ editEpoch: epoch, selection: { anchor: 1, active: 9 } });
			assert.deepStrictEqual(navigation.selection, new vscode.Selection(1, 0, 1, 8));
			const externalUpdate = new Promise<void>(resolve => connection.onUpdate = resolve);
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

	test('keeps accepting edits across saves without resynchronizing the renderer', async () => {
		const file = vscode.Uri.file(path.join(os.tmpdir(), `markdown-editor-save-${Date.now()}.md`));
		await vscode.workspace.fs.writeFile(file, new TextEncoder().encode('initial'));
		const document = await vscode.workspace.openTextDocument(file);
		const panel = new TestPanel();
		const provider = createProvider(new TestMemento());
		const cancellation = new vscode.CancellationTokenSource();
		let renderer: HubRpcConnection<undefined> | undefined;
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const secret = /name="vscode-markdown-editor-message-secret" content="([^"]+)"/.exec(panel.webview.html)?.[1];
			assert.ok(secret);
			const connection = connectRenderer(panel, secret);
			renderer = connection.renderer;
			const { host, updates } = connection;
			await host.ready({ documentVersion: document.version, editEpoch: 0 });

			// Saving flips the dirty state, which fires a change event without content changes.
			await host.edit({ start: 7, endExclusive: 7, text: ' a', editEpoch: 0 });
			assert.ok(await document.save());
			await host.edit({ start: 9, endExclusive: 9, text: 'b', editEpoch: 0 });
			assert.ok(await document.save());

			assert.deepStrictEqual({
				document: document.getText(),
				updates,
			}, {
				document: 'initial ab',
				updates: [],
			});
		} finally {
			panel.dispose();
			renderer?.close();
			provider.dispose();
			cancellation.dispose();
			await vscode.workspace.fs.delete(file);
		}
	});

	test('cancels navigation waiting for renderer readiness and releases it when the panel is disposed', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '# Heading' });
		const panel = new TestPanel();
		const provider = createProvider(new TestMemento());
		const cancellation = new vscode.CancellationTokenSource();
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const navigation = provider.resolveCustomTextEditorNavigation(document, panel, cancellation.token);
			const reveal = navigation.revealRange(new vscode.Range(0, 0, 0, 9), {}, cancellation.token);
			cancellation.cancel();
			await assert.rejects(Promise.resolve(reveal), vscode.CancellationError);
			const captured = navigation.captureViewState();
			panel.dispose();
			await assert.rejects(Promise.resolve(captured), vscode.CancellationError);
			assert.strictEqual(panel.webview.sent.length, 0);
			assert.throws(() => provider.resolveCustomTextEditorNavigation(document, panel, cancellation.token), vscode.CancellationError);
		} finally {
			panel.dispose();
			provider.dispose();
			cancellation.dispose();
		}
	});
});

function createProvider(state: vscode.Memento): MarkdownEditorProvider {
	const extensionUri = vscode.extensions.getExtension('vscode.markdown-language-features')!.extensionUri;
	return new MarkdownEditorProvider(
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
}

function connectRenderer(panel: TestPanel, secret: string) {
	const renderer = HubRpcConnection.fromTransport(new MarkdownEditorRpcTransport(
		secret,
		message => panel.webview.incoming.fire(message),
		listener => panel.webview.outgoing.event(listener),
	));
	const updates: { content: string; editEpoch: number }[] = [];
	const reveals: Parameters<MarkdownEditorRenderer['revealRange']>[0][] = [];
	const connection = {
		renderer,
		host: renderer.get(markdownEditorHost),
		updates,
		reveals,
		onUpdate: undefined as (() => void) | undefined,
	};
	renderer.register(markdownEditorRenderer, {
		readClipboardMedia: () => ({ base64: '' }),
		diagnosticsChanged: () => { },
		update: update => { updates.push(update); connection.onUpdate?.(); },
		codeBlockEditorProviders: () => { },
		codeBlockEditorHostTransportMessage: () => { },
		gutterMarkers: () => { },
		comments: () => { },
		revealComment: () => { },
		revealLinkTarget: () => { },
		captureNavigationState: () => ({ editEpoch: updates.at(-1)!.editEpoch, revision: 0, scrollTop: 0 }),
		revealRange: request => { reveals.push(request); },
		restoreNavigationState: () => { },
		command: () => { },
		highlightThemeChanged: () => { },
		configurationChanged: () => { },
		richLinkPresentations: () => { },
	});
	return connection;
}

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
