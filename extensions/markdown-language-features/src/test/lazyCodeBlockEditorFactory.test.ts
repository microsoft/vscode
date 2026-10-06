/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import type { IframeEmbeddedEditorProvider, VirtualizedIframeEmbeddedEditorOptions } from '@vscode/markdown-editor/web-editors';
import { LazyCodeBlockEditorFactory } from '../preview/lazyCodeBlockEditorFactory';

suite('Markdown editor lazy embedded editors', () => {
	const provider: IframeEmbeddedEditorProvider = {
		id: 'test',
		selector: { language: 'test' },
		resolve: async () => undefined,
	};

	function setup(providers: readonly IframeEmbeddedEditorProvider[] = [provider]) {
		const load = Promise.withResolvers<void>();
		const errors: unknown[] = [];
		const creations: unknown[] = [];
		const updates: (readonly IframeEmbeddedEditorProvider[])[] = [];
		let loadCount = 0;
		let changes = 0;
		let disposals = 0;
		let options: VirtualizedIframeEmbeddedEditorOptions | undefined;
		const factory = new LazyCodeBlockEditorFactory({
			providers,
			onDidChange: () => changes++,
		}, async () => {
			loadCount++;
			await load.promise;
			return initialOptions => {
				options = initialOptions;
				return {
					create: (...args) => { creations.push(args); return undefined; },
					updateProviders: value => { updates.push(value); initialOptions.onDidChange?.(); },
					dispose: () => disposals++,
				};
			};
		}, error => errors.push(error));
		return {
			factory, errors, creations, updates,
			get state() { return { loadCount, changes, disposals, providers: options?.providers }; },
			async finish(error?: Error) {
				if (error) { load.reject(error); } else { load.resolve(); }
				await new Promise<void>(resolve => setImmediate(resolve));
			},
		};
	}

	test('does not load until a block is requested and providers exist', async () => {
		const test = setup([]);
		assert.strictEqual(test.state.loadCount, 0);
		assert.strictEqual(test.factory.create('test', 'test', 'first'), undefined);
		assert.strictEqual(test.state.loadCount, 0);
		test.factory.updateProviders([provider]);
		assert.strictEqual(test.state.changes, 1);
		assert.strictEqual(test.state.loadCount, 0);
		test.factory.create('test', 'test', 'first');
		test.factory.create('test', 'test', 'second');
		assert.strictEqual(test.state.loadCount, 1);
		await test.finish();
		assert.strictEqual(test.state.changes, 2);
		assert.deepStrictEqual(test.creations, []);
		test.factory.create('test', 'test options', 'latest content');
		assert.deepStrictEqual(test.creations, [['test', 'test options', 'latest content']]);
		test.factory.dispose();
	});

	test('uses the latest providers after loading and delegates subsequent updates', async () => {
		const test = setup();
		test.factory.create('test', 'test', '');
		test.factory.updateProviders([]);
		await test.finish();
		assert.deepStrictEqual(test.state.providers, []);
		test.factory.updateProviders([provider]);
		assert.deepStrictEqual(test.updates, [[provider]]);
		assert.strictEqual(test.state.changes, 3);
		test.factory.dispose();
	});

	test('does not construct or refresh after disposal during loading', async () => {
		const test = setup();
		test.factory.create('test', 'test', '');
		test.factory.dispose();
		test.factory.updateProviders([provider]);
		await test.finish();
		assert.deepStrictEqual(test.state, { loadCount: 1, changes: 0, disposals: 0, providers: undefined });
		assert.strictEqual(test.factory.create('test', 'test', ''), undefined);
	});

	test('disposes the loaded adapter exactly once and prevents later calls', async () => {
		const test = setup();
		test.factory.create('test', 'test', '');
		await test.finish();
		test.factory.dispose();
		test.factory.dispose();
		test.factory.create('test', 'test', '');
		test.factory.updateProviders([]);
		assert.strictEqual(test.state.disposals, 1);
		assert.deepStrictEqual(test.creations, []);
		assert.deepStrictEqual(test.updates, []);
	});

	test('reports load failure once without retrying on every render', async () => {
		const test = setup();
		const error = new Error('Unable to load adapter');
		test.factory.create('test', 'test', '');
		await test.finish(error);
		assert.deepStrictEqual(test.errors, [error]);
		assert.strictEqual(test.factory.create('test', 'test', ''), undefined);
		assert.strictEqual(test.state.loadCount, 1);
		test.factory.dispose();
	});

	test('ignores a load rejection after disposal', async () => {
		const test = setup();
		test.factory.create('test', 'test', '');
		test.factory.dispose();
		await test.finish(new Error('Unable to load adapter'));
		assert.deepStrictEqual(test.errors, []);
	});
});
