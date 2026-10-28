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
import { WebEditorClient } from '@vscode/web-editors';
import { MarkdownContributions } from '../markdownExtensions';
import { MarkdownEditorProvider } from '../preview/markdownEditorProvider';
import { markdownEditorHost, markdownEditorRenderer, type MarkdownEditorRenderer } from '../preview/markdownEditorProtocol';
import { MarkdownEditorRpcTransport } from '../preview/markdownEditorRpc';
import { MdLinkOpener } from '../util/openDocumentLink';

suite('Markdown editor bridge', () => {
	test('syncs the document changed before ready and maps navigation and selection offsets', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'initial\r\ncontent' });
		const panel = new TestPanel();
		const state = new TestMemento();
		const provider = createProvider(state);
		const cancellation = new vscode.CancellationTokenSource();
		let connection: ReturnType<typeof connectRenderer> | undefined;
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const secret = /name="vscode-markdown-editor-message-secret" content="([^"]+)"/.exec(panel.webview.html)?.[1];
			assert.ok(secret);
			await replaceDocument(document, 'changed\r\nbefore-ready');
			const navigation = provider.resolveCustomTextEditorNavigation(document, panel, cancellation.token);
			const navigationBeforeReady = navigation.revealRange(new vscode.Range(1, 0, 1, 6), { preserveFocus: true }, cancellation.token);
			assert.strictEqual(panel.webview.sent.length, 0, 'do not start requests before the renderer is listening');
			connection = connectRenderer(panel, secret);
			const { host, client, reveals } = connection;
			await host.ready({});
			await until(() => client.getContent() === 'changed\nbefore-ready', () => client.getContent());
			await navigationBeforeReady;
			assert.deepStrictEqual(reveals, [{ start: 8, endExclusive: 14, version: client.version, revision: 0, preserveFocus: true }]);

			type(client, 0, '\n');
			type(client, 1, 'x');
			await until(() => document.getText() === '\r\nxchanged\r\nbefore-ready', () => [document.getText(), client.getContent()]);
			await host.selectionChanged({ version: client.version, selection: { anchor: 1, active: 9 } });
			assert.deepStrictEqual(navigation.selection, new vscode.Selection(1, 0, 1, 8));

			await replaceDocument(document, 'external\r\n');
			await until(() => client.getContent() === 'external\n', () => [document.getText(), client.getContent()]);
			await host.setReadonly({ readonly: false });
			assert.deepStrictEqual(Array.from(state.values), [['markdown.editor.readonly', false]]);
		} finally {
			panel.dispose();
			connection?.dispose();
			provider.dispose();
			cancellation.dispose();
		}
	});

	test('keeps typing and external edits that happen at the same time', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'one\r\ntwo' });
		const panel = new TestPanel();
		const provider = createProvider(new TestMemento());
		const cancellation = new vscode.CancellationTokenSource();
		let connection: ReturnType<typeof connectRenderer> | undefined;
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const secret = /name="vscode-markdown-editor-message-secret" content="([^"]+)"/.exec(panel.webview.html)?.[1];
			assert.ok(secret);
			connection = connectRenderer(panel, secret);
			const { host, client } = connection;
			await host.ready({});
			await until(() => client.getContent() === 'one\ntwo');

			// The external edit lands while the typing is on its way, so writing the typing is rejected and rebased.
			const external = new vscode.WorkspaceEdit();
			external.insert(document.uri, new vscode.Position(0, 0), '# ');
			external.insert(document.uri, new vscode.Position(1, 3), ' external');
			const applied = vscode.workspace.applyEdit(external);
			type(client, 3, ' typed');
			type(client, 0, 'a\r\nb');
			assert.ok(await applied);
			type(client, String(client.getContent()).length, '!');

			// Both sides converge, and neither the typing nor the external edit is lost.
			await until(() => document.getText().includes('!') && client.getContent() === document.getText().replace(/\r\n/g, '\n'), () => [client.getContent(), document.getText()]);
			const text = document.getText();
			assert.deepStrictEqual(['# ', ' external', ' typed', 'a\r\nb', '!'].filter(part => !text.includes(part)), []);
		} finally {
			panel.dispose();
			connection?.dispose();
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
		let connection: ReturnType<typeof connectRenderer> | undefined;
		try {
			await provider.resolveCustomTextEditor(document, panel, cancellation.token);
			const secret = /name="vscode-markdown-editor-message-secret" content="([^"]+)"/.exec(panel.webview.html)?.[1];
			assert.ok(secret);
			connection = connectRenderer(panel, secret);
			const { host, client } = connection;
			await host.ready({});
			await until(() => client.getContent() === 'initial');
			const hostChanges: unknown[] = [];
			client.onDidApplyHostEdits(({ edits }) => hostChanges.push(edits));

			// Saving flips the dirty state, which fires a change event without content changes.
			type(client, 7, ' a');
			await until(() => document.getText() === 'initial a');
			assert.ok(await document.save());
			type(client, 9, 'b');
			await until(() => document.getText() === 'initial ab');
			assert.ok(await document.save());

			assert.deepStrictEqual({ content: client.getContent(), hostChanges }, { content: 'initial ab', hostChanges: [] });
		} finally {
			panel.dispose();
			connection?.dispose();
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
	const reveals: Parameters<MarkdownEditorRenderer['revealRange']>[0][] = [];
	const client = new WebEditorClient({ connection: renderer });
	renderer.register(markdownEditorRenderer, {
		readClipboardMedia: () => ({ base64: '' }),
		diagnosticsChanged: () => { },
		codeBlockEditorProviders: () => { },
		codeBlockEditorHostTransportMessage: () => { },
		gutterMarkers: () => { },
		comments: () => { },
		revealComment: () => { },
		revealLinkTarget: () => { },
		captureNavigationState: () => ({ version: client.version, revision: 0, scrollTop: 0 }),
		revealRange: request => { reveals.push(request); },
		restoreNavigationState: () => { },
		command: () => { },
		highlightThemeChanged: () => { },
		configurationChanged: () => { },
		richLinkPresentations: () => { },
	});
	return {
		host: renderer.get(markdownEditorHost),
		client,
		reveals,
		dispose: () => { client.dispose(); renderer.close(); },
	};
}

function type(client: WebEditorClient, offset: number, text: string): void {
	client.applyEdits([{ kind: 'stringEdits', path: [], stringEdits: [{ offset, length: 0, newText: text }] }]);
}

async function until(condition: () => boolean, state?: () => unknown): Promise<void> {
	for (let attempt = 0; !condition(); attempt++) {
		if (attempt === 500) {
			throw new Error(`Timed out waiting for the Markdown editor to sync: ${JSON.stringify(state?.())}`);
		}
		await new Promise(resolve => setTimeout(resolve, 10));
	}
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
