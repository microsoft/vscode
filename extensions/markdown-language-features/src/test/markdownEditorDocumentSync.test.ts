/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { WebEditorClient } from '@vscode/web-editors';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { MarkdownEditorDocumentSync, type DocumentEdit, type SyncedDocument } from '../preview/markdownEditorDocumentSync';
import { createMarkdownEditorRpcConnection, MarkdownEditorRpcTransport } from '../preview/markdownEditorRpc';

suite('Markdown editor document sync', () => {
	const disposables: vscode.Disposable[] = [];
	teardown(() => disposables.splice(0).reverse().forEach(item => item.dispose()));

	async function setup(text: string, eol: '\n' | '\r\n' = '\n') {
		const document = new FakeDocument(text, eol);
		const logs: string[] = [];
		const sync = new MarkdownEditorDocumentSync(document, message => logs.push(message));
		const network = new ManualNetwork();
		const hostConnection = createMarkdownEditorRpcConnection(network.transport('host'), (operation, error) => { throw new Error(`${operation}: ${error}`); });
		const editorConnection = createMarkdownEditorRpcConnection(network.transport('editor'), (operation, error) => { throw new Error(`${operation}: ${error}`); });
		sync.connect(hostConnection);
		const client = new WebEditorClient({ connection: editorConnection });
		disposables.push(sync, { dispose: () => { client.dispose(); hostConnection.close(); editorConnection.close(); } });
		const test = {
			document, sync, client, network, logs,
			type: (offset: number, newText: string, length = 0) => {
				client.applyEdits([{ kind: 'stringEdits', path: [], stringEdits: [{ offset, length, newText }] }]);
			},
			/** Delivers messages and completes document writes until nothing is left to do. */
			settle: async () => {
				while (await network.deliver() || await document.completeWrites()) { }
			},
			state: () => ({ document: document.text, sync: sync.text, editor: client.getContent() }),
		};
		await test.settle();
		return test;
	}

	test('writes typing to a CRLF document', async () => {
		const test = await setup('a\r\nb', '\r\n');
		assert.strictEqual(test.client.getContent(), 'a\nb');
		test.type(1, '\n');
		test.type(4, '!');
		await test.settle();
		assert.deepStrictEqual(test.state(), { document: 'a\r\n\r\nb!', sync: 'a\n\nb!', editor: 'a\n\nb!' });
	});

	test('normalizes line breaks the editor inserts', async () => {
		const test = await setup('a', '\r\n');
		test.type(1, '\r\nb\rc');
		await test.settle();
		assert.deepStrictEqual(test.state(), { document: 'a\r\nb\r\nc', sync: 'a\nb\nc', editor: 'a\nb\nc' });
	});

	test('ignores change events without text changes', async () => {
		const test = await setup('text');
		test.type(4, '!');
		await test.network.deliver();
		test.document.fireChange();
		await test.settle();
		assert.deepStrictEqual(test.state(), { document: 'text!', sync: 'text!', editor: 'text!' });
	});

	test('rebases and rewrites typing the document rejected because of an external change', async () => {
		const test = await setup('one\ntwo');
		test.type(3, '1');
		await test.network.deliver();
		assert.strictEqual(test.document.pendingWrites, 1);
		test.document.change(0, 0, '# ');
		test.type(4, '!');
		await test.settle();
		assert.deepStrictEqual(test.state(), { document: '# one1!\ntwo', sync: '# one1!\ntwo', editor: '# one1!\ntwo' });
		assert.deepStrictEqual(test.logs, []);
	});

	test('merges external changes with typing the host has not received', async () => {
		const test = await setup('one\ntwo');
		test.type(7, ' typed');
		test.document.change(0, 3, 'ONE');
		test.document.change(7, 7, ' external');
		await test.settle();
		assert.deepStrictEqual(test.state(), {
			document: 'ONE\ntwo external typed', sync: 'ONE\ntwo external typed', editor: 'ONE\ntwo external typed',
		});
	});

	test('keeps typing when the external change and the write complete in either order', async () => {
		for (const externalFirst of [true, false]) {
			const test = await setup('ab');
			test.type(1, 'X');
			await test.network.deliver();
			if (!externalFirst) {
				await test.document.completeWrites();
			}
			test.document.change(test.document.text.length, test.document.text.length, 'Y');
			await test.settle();
			assert.deepStrictEqual(test.state(), { document: 'aXbY', sync: 'aXbY', editor: 'aXbY' }, `externalFirst: ${externalFirst}`);
		}
	});

	test('reverts typing a read-only document rejects', async () => {
		const test = await setup('locked');
		test.document.readonly = true;
		test.type(0, 'x');
		await test.settle();
		assert.deepStrictEqual(test.state(), { document: 'locked', sync: 'locked', editor: 'locked' });
		assert.deepStrictEqual(test.logs, ['The document rejected the Markdown editor changes']);
	});

	test('tracks offsets from the editor through later changes and drains pending writes', async () => {
		const test = await setup('hello world');
		const tracked = test.sync.trackFromEditor(test.client.version, 6);
		assert.strictEqual(tracked?.offset, 6);
		test.type(0, '>> ');
		await test.network.deliver();
		assert.strictEqual(tracked?.offset, 9, 'moved by the typing');
		test.document.change(0, 0, 'A');
		assert.strictEqual(tracked?.offset, 10, 'moved by the external change');

		let drained = false;
		const drain = test.sync.drain().then(() => drained = true);
		await test.network.deliver();
		assert.strictEqual(drained, false);
		await test.settle();
		await drain;
		assert.strictEqual(test.sync.text, test.document.text);
		assert.strictEqual(test.sync.trackFromEditor(test.client.version, 100), undefined);
	});

	test('converges with random typing, external changes and message orders', async () => {
		const random = new Random(42);
		for (let iteration = 0; iteration < 40; iteration++) {
			const test = await setup('0123456789', iteration % 2 ? '\r\n' : '\n');
			const inserted: string[] = [];
			let nextChar = 0x100;
			const unique = () => {
				const char = String.fromCharCode(nextChar++);
				inserted.push(char);
				return char;
			};
			for (let step = 0; step < 30; step++) {
				const action = random.next(5);
				if (action === 0) {
					test.type(random.next(String(test.client.getContent()).length + 1), unique());
				} else if (action === 1) {
					const text = test.document.text;
					const offset = random.next(text.length + 1);
					if (text[offset - 1] !== '\r') {
						test.document.change(offset, offset, random.next(4) ? unique() : '\n');
					}
				} else if (action === 2) {
					await test.network.deliverOne();
				} else if (action === 3) {
					await test.document.completeWrites(1);
				} else {
					await new Promise(resolve => setImmediate(resolve));
				}
			}
			await test.settle();
			const { document, sync, editor } = test.state();
			assert.strictEqual(editor, sync, `iteration ${iteration}`);
			assert.strictEqual(document.replace(/\r\n/g, '\n'), sync, `iteration ${iteration}`);
			assert.deepStrictEqual(inserted.filter(char => !sync.includes(char)), [], `iteration ${iteration}: lost typing`);
			disposables.splice(0).reverse().forEach(item => item.dispose());
		}
	});
});

/** A document whose writes complete only when the test says so. */
class FakeDocument implements SyncedDocument {
	version = 1;
	readonly = false;
	#writes: { version: number; edits: readonly DocumentEdit[]; resolve: (applied: boolean) => void }[] = [];
	readonly #onDidChange = new vscode.EventEmitter<void>();

	constructor(public text: string, readonly eol: '\n' | '\r\n') { }

	get pendingWrites(): number {
		return this.#writes.length;
	}

	getText(): string {
		return this.text;
	}

	applyEdits(version: number, edits: readonly DocumentEdit[]): Promise<boolean> {
		return new Promise(resolve => this.#writes.push({ version, edits, resolve }));
	}

	onDidChangeContent(listener: () => void): vscode.Disposable {
		return this.#onDidChange.event(listener);
	}

	/** Changes the text like another extension would; `start` and `end` are offsets. */
	change(start: number, end: number, text: string): void {
		this.text = this.text.slice(0, start) + text + this.text.slice(end);
		this.version++;
		this.fireChange();
	}

	fireChange(): void {
		this.#onDidChange.fire();
	}

	/** Completes up to `count` writes; a write is rejected if the document changed since its version. */
	async completeWrites(count = Infinity): Promise<boolean> {
		const writes = this.#writes.splice(0, count);
		for (const write of writes) {
			const applied = !this.readonly && write.version === this.version;
			if (applied) {
				const document = TextDocument.create('', 'markdown', 0, this.text);
				this.text = TextDocument.applyEdits(document, write.edits.map(({ start, end, text }) => ({ range: { start, end }, newText: text })));
				this.version++;
				this.fireChange();
			}
			write.resolve(applied);
			await new Promise(resolve => setImmediate(resolve));
		}
		return writes.length > 0;
	}
}

/** Connects two endpoints whose messages are delivered only when the test says so, in order. */
class ManualNetwork {
	readonly #queue: { to: 'host' | 'editor'; message: unknown }[] = [];
	readonly #listeners = new Map<'host' | 'editor', (message: unknown) => void>();

	transport(side: 'host' | 'editor'): MarkdownEditorRpcTransport {
		const other = side === 'host' ? 'editor' : 'host';
		return new MarkdownEditorRpcTransport('secret', message => {
			this.#queue.push({ to: other, message: JSON.parse(JSON.stringify(message)) });
		}, listener => {
			this.#listeners.set(side, listener);
			return { dispose: () => this.#listeners.delete(side) };
		});
	}

	async deliverOne(): Promise<boolean> {
		const next = this.#queue.shift();
		if (next) {
			this.#listeners.get(next.to)?.(next.message);
		}
		await new Promise(resolve => setImmediate(resolve));
		return next !== undefined;
	}

	/** Delivers until no messages are left; resolves whether any were. */
	async deliver(): Promise<boolean> {
		let delivered = false;
		while (await this.deliverOne()) {
			delivered = true;
		}
		return delivered;
	}
}

/** A deterministic random number generator (mulberry32). */
class Random {
	constructor(private _state: number) { }

	/** An integer in [0, bound). */
	next(bound: number): number {
		let t = this._state += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * bound);
	}
}
