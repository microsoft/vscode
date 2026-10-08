/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { ErrorCode, type InterfaceHandlers, type JsonRpcMessage } from '@vscode/hubrpc';
import { markdownEditorHost, markdownEditorRenderer } from '../preview/markdownEditorProtocol';
import { createMarkdownEditorRpcConnection, MarkdownEditorRpcTransport } from '../preview/markdownEditorRpc';
import { RecoveringTaskQueue } from '../preview/recoveringTaskQueue';

suite('Markdown editor RPC', () => {
	const disposables: { dispose(): void }[] = [];
	teardown(() => {
		for (const disposable of disposables.splice(0).reverse()) {
			disposable.dispose();
		}
	});

	function pair(hostOverrides: Partial<InterfaceHandlers<typeof markdownEditorHost>> = {}, rendererOverrides: Partial<InterfaceHandlers<typeof markdownEditorRenderer>> = {}) {
		const hostInbox = new Inbox();
		const rendererInbox = new Inbox();
		const hostTransport = new MarkdownEditorRpcTransport('secret', value => rendererInbox.deliver(value), listener => hostInbox.subscribe(listener));
		const rendererTransport = new MarkdownEditorRpcTransport('secret', value => hostInbox.deliver(value), listener => rendererInbox.subscribe(listener));
		const errors: { operation: string; error: unknown }[] = [];
		const report = (operation: string, error: unknown) => { errors.push({ operation, error }); };
		const host = createMarkdownEditorRpcConnection(hostTransport, report);
		const renderer = createMarkdownEditorRpcConnection(rendererTransport, report);
		host.register(markdownEditorHost, {
			ready: () => { },
			edit: () => { },
			history: () => { },
			openLink: () => { },
			setReadonly: () => { },
			editorFocusChanged: () => { },
			richLinkSubscriptions: () => { },
			resolveCodeBlockEditor: () => ({}),
			createCodeBlockEditorHostTransport: () => { },
			codeBlockEditorHostTransportMessage: () => { },
			disposeCodeBlockEditorHostTransport: () => { },
			codeBlockEditorDiagnostic: () => { },
			addComment: () => { },
			deleteComment: () => { },
			highlight: () => ({ tokens: [], colorMap: [] }),
			prepareRename: () => ({ start: 0, endExclusive: 1, placeholder: 'name' }),
			rename: () => { },
			cancelRename: () => { },
			getDiagnostics: () => ({ editEpoch: 0, items: [] }),
			completions: () => ({ items: [], incomplete: false }),
			acceptCompletion: () => ({ offset: 0, editEpoch: 0, retrigger: false }),
			cancelCompletions: () => { },
			pasteImages: () => ({ offset: 0, editEpoch: 0 }),
			...hostOverrides,
		});
		host.get(markdownEditorRenderer);
		renderer.register(markdownEditorRenderer, {
			diagnosticsChanged: () => { },
			update: () => { },
			codeBlockEditorProviders: () => { },
			codeBlockEditorHostTransportMessage: () => { },
			gutterMarkers: () => { },
			comments: () => { },
			revealComment: () => { },
			revealLinkTarget: () => { },
			command: () => { },
			highlightThemeChanged: () => { },
			richLinkPresentations: () => { },
			...rendererOverrides,
		});
		disposables.push({ dispose: () => { host.close(); renderer.close(); } });
		return { host, renderer, hostInbox, rendererInbox, errors };
	}

	test('sends presentation notifications without request IDs or acknowledgement messages', async () => {
		const seen: unknown[] = [];
		const { host, renderer, hostInbox, rendererInbox, errors } = pair({
			richLinkSubscriptions: params => { seen.push(params); },
			codeBlockEditorDiagnostic: params => { seen.push(params); },
		}, {
			comments: params => { seen.push(params); },
			highlightThemeChanged: params => { seen.push(params); },
		});
		const subscriptions = { subscribe: [{ subscriptionId: 'first', href: 'target' }], unsubscribe: [] };
		renderer.get(markdownEditorHost).richLinkSubscriptions(subscriptions);
		renderer.get(markdownEditorHost).codeBlockEditorDiagnostic({ message: 'test' });
		host.get(markdownEditorRenderer).comments({ comments: [], acceptsComments: true });
		host.get(markdownEditorRenderer).highlightThemeChanged({});
		await new Promise<void>(resolve => setImmediate(resolve));
		assert.deepStrictEqual(seen, [subscriptions, { message: 'test' }, { comments: [], acceptsComments: true }, {}]);
		assert.deepStrictEqual([...hostInbox.messages, ...rendererInbox.messages], [
			{ channel: 'markdownEditor', messageSecret: 'secret', message: { jsonrpc: '2.0', method: 'markdown.editor.host::richLinkSubscriptions', params: subscriptions } },
			{ channel: 'markdownEditor', messageSecret: 'secret', message: { jsonrpc: '2.0', method: 'markdown.editor.host::codeBlockEditorDiagnostic', params: { message: 'test' } } },
			{ channel: 'markdownEditor', messageSecret: 'secret', message: { jsonrpc: '2.0', method: 'markdown.editor.renderer::comments', params: { comments: [], acceptsComments: true } } },
			{ channel: 'markdownEditor', messageSecret: 'secret', message: { jsonrpc: '2.0', method: 'markdown.editor.renderer::highlightThemeChanged', params: {} } },
		], 'notifications must not create request IDs or acknowledgement messages');
		assert.deepStrictEqual(errors, []);
	});

	test('validates and authenticates notifications and reports handler failures locally', async () => {
		let targets = 0;
		const failure = new Error('Notification handler failed');
		const { renderer, hostInbox, rendererInbox, errors } = pair({
			richLinkSubscriptions: () => { targets++; },
			codeBlockEditorDiagnostic: () => { throw failure; },
		});
		const message = { jsonrpc: '2.0', method: 'markdown.editor.host::richLinkSubscriptions', params: { subscribe: [{ subscriptionId: 'first', href: 'target' }], unsubscribe: [] } };
		hostInbox.deliver({ channel: 'markdownEditor', messageSecret: 'old-secret', message });
		await renderer.channel.sendNotification(message.method, { subscribe: [{ subscriptionId: 'first', href: 42 }], unsubscribe: [] });
		assert.strictEqual(targets, 0);
		renderer.get(markdownEditorHost).richLinkSubscriptions({ subscribe: [{ subscriptionId: 'first', href: 'valid' }], unsubscribe: [] });
		renderer.get(markdownEditorHost).codeBlockEditorDiagnostic({ message: 'test' });
		assert.strictEqual(targets, 1);
		assert.deepStrictEqual(errors, [{ operation: 'Handle notification markdown.editor.host::codeBlockEditorDiagnostic', error: failure }]);
		assert.deepStrictEqual(rendererInbox.messages, [], 'even failed notifications have no response');
	});

	test('reports notification delivery failures and sends after close without unhandled rejections', async () => {
		const inbox = new Inbox();
		const errors: unknown[] = [];
		const connection = createMarkdownEditorRpcConnection(new MarkdownEditorRpcTransport(
			'secret', () => Promise.resolve(false), listener => inbox.subscribe(listener),
		), (_operation, error) => errors.push(error));
		disposables.push({ dispose: () => connection.close() });
		const client = connection.get(markdownEditorRenderer);
		client.highlightThemeChanged({});
		await new Promise<void>(resolve => setImmediate(resolve));
		assert.strictEqual(errors.length, 1);
		assert.match(String(errors[0]), /rejected RPC message/);
		connection.close();
		client.highlightThemeChanged({});
		await new Promise<void>(resolve => setImmediate(resolve));
		assert.strictEqual(errors.length, 2);
	});

	test('dispatches validated requests in both directions and correlates out-of-order results', async () => {
		let finishFirst!: (value: { tokens: []; colorMap: string[] }) => void;
		const seen: unknown[] = [];
		const { host, renderer } = pair({
			highlight: ({ source }) => source === 'first'
				? new Promise(resolve => finishFirst = resolve)
				: { tokens: [], colorMap: ['second'] },
			resolveCodeBlockEditor: () => ({ descriptor: { html: '<div></div>', runtimeKey: 'editor', contentType: 'text' } }),
			addComment: params => { seen.push(params); },
		}, {
			update: params => { seen.push(params); },
			codeBlockEditorHostTransportMessage: params => { seen.push(params); },
		});
		const client = renderer.get(markdownEditorHost);
		const first = client.highlight({ source: 'first', languageId: 'text' });
		const second = await client.highlight({ source: 'second', languageId: 'text' });
		finishFirst({ tokens: [], colorMap: ['first'] });
		const remote = host.get(markdownEditorRenderer);
		await remote.update({ content: 'authoritative\r\n', editEpoch: 3 });
		await client.addComment({ start: 0, endExclusive: 2, text: 'comment' });
		await remote.codeBlockEditorHostTransportMessage({ runtimeId: 'one', message: { nested: ['opaque', 2] } });
		assert.deepStrictEqual({
			first: await first,
			second,
			descriptor: await client.resolveCodeBlockEditor({ providerId: 'p', language: 'text' }),
			seen,
		}, {
			first: { tokens: [], colorMap: ['first'] },
			second: { tokens: [], colorMap: ['second'] },
			descriptor: { descriptor: { html: '<div></div>', runtimeKey: 'editor', contentType: 'text' } },
			seen: [
				{ content: 'authoritative\r\n', editEpoch: 3 },
				{ start: 0, endExclusive: 2, text: 'comment' },
				{ runtimeId: 'one', message: { nested: ['opaque', 2] } },
			],
		});
	});

	test('routes rename sessions and rejects invalid offsets across RPC', async () => {
		const seen: unknown[] = [];
		const { renderer } = pair({
			prepareRename: params => { seen.push(params); return { start: 2, endExclusive: 8, placeholder: 'Target' }; },
			rename: params => { seen.push(params); },
			cancelRename: params => { seen.push(params); },
		});
		const client = renderer.get(markdownEditorHost);
		assert.deepStrictEqual(await client.prepareRename({ requestId: 4, offset: 3, editEpoch: 2 }),
			{ start: 2, endExclusive: 8, placeholder: 'Target' });
		await client.rename({ requestId: 4, newName: 'New target' });
		await client.cancelRename({ requestId: 4 });
		await assert.rejects(renderer.channel.sendRequest('markdown.editor.host::prepareRename',
			{ requestId: 4, offset: -1, editEpoch: 2 }), { code: ErrorCode.invalidParams });
		assert.deepStrictEqual(seen, [
			{ requestId: 4, offset: 3, editEpoch: 2 },
			{ requestId: 4, newName: 'New target' },
			{ requestId: 4 },
		]);
	});

	test('rejects malformed parameters, unknown members, and failed handlers', async () => {
		let edits = 0;
		const { renderer } = pair({
			edit: () => { edits++; },
			openLink: () => { throw new Error('Link resolution failed'); },
		});
		await assert.rejects(renderer.channel.sendRequest('markdown.editor.host::edit', { start: -1, endExclusive: 2, text: '', editEpoch: 0 }), { code: ErrorCode.invalidParams });
		await assert.rejects(renderer.channel.sendRequest('markdown.editor.host::missing', {}), { code: ErrorCode.methodNotFound });
		await assert.rejects(renderer.get(markdownEditorHost).openLink({ href: 'target' }), /Link resolution failed/);
		assert.strictEqual(edits, 0);
	});

	test('ignores unauthenticated requests and responses from nested frames or old generations', async () => {
		let edits = 0;
		let finish!: () => void;
		const { renderer, hostInbox, rendererInbox } = pair({
			edit: () => { edits++; },
			history: () => new Promise<void>(resolve => finish = resolve),
		});
		const forged = { jsonrpc: '2.0', id: 8, method: 'markdown.editor.host::edit', params: { start: 0, endExclusive: 0, text: 'attack', editEpoch: 0 } };
		hostInbox.deliver({ channel: 'markdownEditor', message: forged });
		hostInbox.deliver({ channel: 'markdownEditor', messageSecret: 'old-secret', message: forged });
		const pending = renderer.get(markdownEditorHost).history({ command: 'undo' });
		let settled = false;
		void pending.then(() => settled = true);
		rendererInbox.deliver({ channel: 'markdownEditor', messageSecret: 'wrong', message: { jsonrpc: '2.0', id: 1, result: null } });
		await Promise.resolve();
		assert.deepStrictEqual({ edits, settled }, { edits: 0, settled: false });
		finish();
		await pending;
	});

	test('close rejects pending calls, aborts incoming work, and detaches listeners', async () => {
		let signal: AbortSignal | undefined;
		let finish!: () => void;
		const { host, renderer, hostInbox, rendererInbox } = pair({
			history: (_params, _context, stream) => {
				signal = stream.signal;
				return new Promise<void>(resolve => finish = resolve);
			},
		});
		const pending = renderer.get(markdownEditorHost).history({ command: 'redo' });
		const rejected = assert.rejects(pending, { code: ErrorCode.peerDisconnected });
		host.close();
		renderer.close();
		await rejected;
		finish();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual({
			aborted: signal?.aborted,
			hostListeners: hostInbox.size,
			rendererListeners: rendererInbox.size,
		}, { aborted: true, hostListeners: 0, rendererListeners: 0 });
	});

	test('reports delivery rejection and buffers until a listener is attached', async () => {
		const inbox = new Inbox();
		const transport = new MarkdownEditorRpcTransport('secret', () => Promise.resolve(false), listener => inbox.subscribe(listener));
		disposables.push(transport);
		const message: JsonRpcMessage = { jsonrpc: '2.0', id: 1, method: 'ready' };
		inbox.deliver({ channel: 'markdownEditor', messageSecret: 'secret', message });
		const received: JsonRpcMessage[] = [];
		transport.setListener(value => received.push(value));
		const second: JsonRpcMessage = { jsonrpc: '2.0', id: 2, method: 'edit' };
		inbox.deliver({ channel: 'markdownEditor', messageSecret: 'secret', message: second });
		await Promise.resolve();
		assert.deepStrictEqual(received, [message, second]);
		await assert.rejects(transport.send(message), /rejected RPC message/);
		transport.dispose();
		await assert.rejects(transport.send(message), /disposed/);
	});

	test('preserves edit enqueue order and the history drain barrier across RPC', async () => {
		const events: string[] = [];
		const queue = new RecoveringTaskQueue(async error => { throw error; }, error => { throw error; });
		let finish!: () => void;
		const gate = new Promise<void>(resolve => finish = resolve);
		const { renderer } = pair({
			edit: edit => queue.enqueue(edit.editEpoch, async () => {
				await gate;
				events.push(edit.text);
			}),
			history: async () => {
				await queue.drain();
				events.push('undo');
			},
		});
		const client = renderer.get(markdownEditorHost);
		const first = client.edit({ start: 0, endExclusive: 0, text: 'first', editEpoch: 0 });
		const second = client.edit({ start: 5, endExclusive: 5, text: 'second', editEpoch: 0 });
		const undo = client.history({ command: 'undo' });
		finish();
		await Promise.all([first, second, undo]);
		queue.invalidate();
		await client.edit({ start: 0, endExclusive: 0, text: 'stale', editEpoch: 0 });
		assert.deepStrictEqual(events, ['first', 'second', 'undo']);
	});
});

class Inbox {
	private readonly _listeners = new Set<(value: unknown) => void>();
	readonly messages: unknown[] = [];

	get size(): number {
		return this._listeners.size;
	}

	subscribe(listener: (value: unknown) => void): { dispose(): void } {
		this._listeners.add(listener);
		return { dispose: () => this._listeners.delete(listener) };
	}

	deliver(value: unknown): void {
		const serialized: unknown = JSON.parse(JSON.stringify(value));
		this.messages.push(serialized);
		for (const listener of this._listeners) {
			listener(serialized);
		}
	}
}
