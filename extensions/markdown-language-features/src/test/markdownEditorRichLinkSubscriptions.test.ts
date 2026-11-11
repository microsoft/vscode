/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MarkdownEditorRichLinkController } from '../preview/markdownEditorRichLinks';
import type { RichLinkPresentationUpdate } from '../preview/markdownEditorProtocol';
import { MdLinkOpener } from '../util/openDocumentLink';

suite('Markdown editor rich link subscriptions', () => {
	let controller: MarkdownEditorRichLinkController;
	let rulesDescriptor: PropertyDescriptor;
	let createWatcher: typeof vscode.window.createLinkPresentationWatcher;
	let watchers: TestWatcher[];
	let updates: RichLinkPresentationUpdate[];
	let errors: unknown[];
	const href = 'https://example.com/pull/1';

	setup(async () => {
		const descriptor = Object.getOwnPropertyDescriptor(vscode.window, 'linkPresentationRules');
		assert.ok(descriptor);
		rulesDescriptor = descriptor;
		createWatcher = vscode.window.createLinkPresentationWatcher;
		watchers = [];
		updates = [];
		errors = [];
		const rules: readonly vscode.LinkPresentationRule[] = [{ id: 'test', uriPattern: /^https:\/\/example\.com\//g, kind: 'session' }];
		Object.defineProperty(vscode.window, 'linkPresentationRules', { configurable: true, get: () => rules });
		vscode.window.createLinkPresentationWatcher = () => {
			const watcher = new TestWatcher({ kind: 'chat', title: 'Current title' });
			watchers.push(watcher);
			return watcher;
		};
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '' });
		controller = new MarkdownEditorRichLinkController(
			document,
			new MdLinkOpener({ resolveLinkTarget: async () => undefined }),
			{ trace: (...args) => { errors.push(args); } },
			({ presentations }) => { updates.push(...presentations); },
		);
	});

	teardown(() => {
		controller?.dispose();
		vscode.window.createLinkPresentationWatcher = createWatcher;
		Object.defineProperty(vscode.window, 'linkPresentationRules', rulesDescriptor);
	});

	test('publishes a current snapshot and subsequent changes for each subscription', async () => {
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'first', href }], unsubscribe: [] });
		await settle();
		assert.deepStrictEqual(updates, [{
			subscriptionId: 'first',
			presentation: { kind: 'session', title: 'Current title' },
		}]);
		watchers[0].update({ kind: 'chat', title: 'Changed title', isLoading: true });
		assert.deepStrictEqual(updates[1], {
			subscriptionId: 'first',
			presentation: { kind: 'session', title: 'Changed title', isLoading: true },
		});
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'second', href }], unsubscribe: [] });
		await settle();
		assert.deepStrictEqual(updates[2], {
			subscriptionId: 'second',
			presentation: { kind: 'session', title: 'Current title' },
		}, 'a subscription must receive a snapshot even when the URL is already watched');
		assert.deepStrictEqual(errors, []);
	});

	test('unsubscribes only the requested watcher and recreates it with a fresh snapshot', async () => {
		controller.updateSubscriptions({
			subscribe: [{ subscriptionId: 'first', href }, { subscriptionId: 'other', href: 'https://example.com/pull/2' }],
			unsubscribe: [],
		});
		await settle();
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'replacement', href }], unsubscribe: ['first'] });
		await settle();
		assert.deepStrictEqual(watchers.map(watcher => watcher.disposed), [true, false, false]);
		const count = updates.length;
		watchers[0].update({ kind: 'chat', title: 'Old update' });
		assert.strictEqual(updates.length, count);
		watchers[1].update({ kind: 'chat', title: 'Other update' });
		assert.strictEqual(updates.at(-1)?.subscriptionId, 'other');
		assert.ok(updates.some(value => value.subscriptionId === 'replacement' && value.presentation?.title === 'Current title'));
	});

	test('cancels subscriptions while resolving and releases all watchers on clear or disposal', async () => {
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'cancelled', href }], unsubscribe: [] });
		controller.updateSubscriptions({ subscribe: [], unsubscribe: ['cancelled'] });
		await settle();
		assert.deepStrictEqual({ watchers: watchers.length, updates }, { watchers: 0, updates: [] });
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'first', href }], unsubscribe: [] });
		await settle();
		controller.clear();
		assert.strictEqual(watchers[0].disposed, true);
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'after-reload', href }], unsubscribe: [] });
		await settle();
		assert.strictEqual(updates.at(-1)?.subscriptionId, 'after-reload');
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'pending', href }], unsubscribe: [] });
		controller.dispose();
		await settle();
		assert.strictEqual(watchers.length, 2);
		assert.ok(watchers.every(watcher => watcher.disposed));
	});

	test('publishes unavailable snapshots and logs lookup failures rather than leaving loading state', async () => {
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'unsupported', href: 'https://unsupported.example/' }], unsubscribe: [] });
		await settle();
		assert.deepStrictEqual(updates, [{ subscriptionId: 'unsupported', presentation: undefined }]);
		vscode.window.createLinkPresentationWatcher = () => { throw new Error('Watcher failed'); };
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'failed', href }], unsubscribe: [] });
		await settle();
		assert.deepStrictEqual(updates[1], { subscriptionId: 'failed', presentation: undefined });
		assert.strictEqual(errors.length, 1);
		assert.match(String(errors[0]), /Watcher failed/);
	});

	test('rejects duplicate subscription IDs without replacing the existing watcher', async () => {
		controller.updateSubscriptions({ subscribe: [{ subscriptionId: 'first', href }], unsubscribe: [] });
		await settle();
		assert.throws(() => controller.updateSubscriptions({
			subscribe: [{ subscriptionId: 'first', href }],
			unsubscribe: [],
		}), /Duplicate rich link subscription/);
		assert.strictEqual(watchers.length, 1);
		assert.strictEqual(watchers[0].disposed, false);
	});
});

class TestWatcher implements vscode.LinkPresentationWatcher {
	private readonly _changes = new vscode.EventEmitter<void>();
	readonly onDidChangePresentation = this._changes.event;
	disposed = false;

	constructor(public presentation: vscode.LinkPresentationData) { }

	update(presentation: vscode.LinkPresentationData): void {
		this.presentation = presentation;
		this._changes.fire();
	}

	dispose(): void {
		this.disposed = true;
		this._changes.dispose();
	}
}

function settle(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}
