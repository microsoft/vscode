/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { SimpleBrowserManager } from '../simpleBrowserManager';
import { ShowOptions } from '../simpleBrowserView';

class TestView {
	private readonly _onDispose = new vscode.EventEmitter<void>();
	public readonly onDispose = this._onDispose.event;
	public readonly shown: Array<{ readonly url: string; readonly options?: ShowOptions }> = [];
	public disposed = false;

	public show(url: string, options?: ShowOptions): void {
		this.shown.push({ url, options });
	}

	public dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this._onDispose.fire();
			this._onDispose.dispose();
		}
	}
}

function createManager(
	created: TestView[],
	restored: TestView[],
	hasRestorableView: () => boolean,
): SimpleBrowserManager {
	return new SimpleBrowserManager(vscode.Uri.parse('file:///simple-browser'), {
		create: (_extensionUri, url, options) => {
			const view = new TestView();
			view.show(url, options);
			created.push(view);
			return view;
		},
		restore: (_extensionUri, url, _panel) => {
			const view = new TestView();
			view.show(url);
			restored.push(view);
			return view;
		},
	}, hasRestorableView);
}

suite('SimpleBrowserManager', () => {
	test('reuses one view for rapid show requests', () => {
		const created: TestView[] = [];
		const restored: TestView[] = [];
		const manager = createManager(created, restored, () => false);

		manager.show('https://example.com/one');
		manager.show('https://example.com/two');

		assert.strictEqual(created.length, 1);
		assert.deepStrictEqual(created[0].shown.map(item => item.url), [
			'https://example.com/one',
			'https://example.com/two',
		]);
		assert.strictEqual(restored.length, 0);
		manager.dispose();
	});

	test('applies a pending show request to the restored view', () => {
		const created: TestView[] = [];
		const restored: TestView[] = [];
		const manager = createManager(created, restored, () => true);

		manager.show('https://example.com/one');
		manager.show('https://example.com/two');
		manager.restore({} as vscode.WebviewPanel, { url: 'https://example.com/restored' });

		assert.strictEqual(created.length, 0);
		assert.strictEqual(restored.length, 1);
		assert.deepStrictEqual(restored[0].shown.map(item => item.url), [
			'https://example.com/restored',
			'https://example.com/two',
		]);

		manager.show('https://example.com/three');
		assert.strictEqual(restored[0].shown.at(-1)?.url, 'https://example.com/three');
		manager.dispose();
	});

	test('disposes a late restored view when creation wins the race', () => {
		const created: TestView[] = [];
		const restored: TestView[] = [];
		const manager = createManager(created, restored, () => false);

		manager.show('https://example.com/created');
		manager.restore({} as vscode.WebviewPanel, { url: 'https://example.com/restored' });
		manager.show('https://example.com/updated');

		assert.strictEqual(created.length, 1);
		assert.strictEqual(restored.length, 1);
		assert.strictEqual(restored[0].disposed, true);
		assert.deepStrictEqual(created[0].shown.map(item => item.url), [
			'https://example.com/created',
			'https://example.com/updated',
		]);
		manager.dispose();
	});

	test('creates a new view after the active view is disposed', () => {
		const created: TestView[] = [];
		const restored: TestView[] = [];
		let hasRestorableView = false;
		const manager = createManager(created, restored, () => hasRestorableView);

		manager.show('https://example.com/one');
		hasRestorableView = true;
		created[0].dispose();
		manager.show('https://example.com/two');

		assert.strictEqual(created.length, 2);
		assert.strictEqual(created[0].disposed, true);
		assert.strictEqual(created[1].shown[0].url, 'https://example.com/two');
		manager.dispose();
	});
});
