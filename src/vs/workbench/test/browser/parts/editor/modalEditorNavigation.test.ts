/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModalEditorNavigation, IModalEditorPartOptions } from '../../../../../platform/editor/common/editor.js';

/**
 * Simple test harness that mimics the ModalEditorPartImpl navigation behavior
 * without requiring the full editor part infrastructure.
 */
class TestModalEditorNavigationHost {

	private readonly _onDidChangeNavigation = new Emitter<IModalEditorNavigation | undefined>();
	readonly onDidChangeNavigation = this._onDidChangeNavigation.event;

	private _navigation: IModalEditorNavigation | undefined;
	get navigation(): IModalEditorNavigation | undefined { return this._navigation; }

	updateOptions(options: IModalEditorPartOptions): void {
		this._navigation = options.navigation;
		this._onDidChangeNavigation.fire(options.navigation);
	}

	dispose(): void {
		this._onDidChangeNavigation.dispose();
	}
}

suite('Modal Editor Navigation', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('updateOptions sets navigation and fires event', () => {
		const host = new TestModalEditorNavigationHost();
		disposables.add({ dispose: () => host.dispose() });

		const events: (IModalEditorNavigation | undefined)[] = [];
		disposables.add(host.onDidChangeNavigation(ctx => events.push(ctx)));

		const nav: IModalEditorNavigation = {
			total: 10,
			current: 3,
			navigate: () => { }
		};

		host.updateOptions({ navigation: nav });

		assert.strictEqual(host.navigation, nav);
		assert.deepStrictEqual(events, [nav]);
	});

	test('updateOptions with undefined navigation clears navigation', () => {
		const host = new TestModalEditorNavigationHost();
		disposables.add({ dispose: () => host.dispose() });

		const events: (IModalEditorNavigation | undefined)[] = [];
		disposables.add(host.onDidChangeNavigation(ctx => events.push(ctx)));

		const nav: IModalEditorNavigation = {
			total: 5,
			current: 0,
			navigate: () => { }
		};

		host.updateOptions({ navigation: nav });
		host.updateOptions({ navigation: undefined });

		assert.strictEqual(host.navigation, undefined);
		assert.deepStrictEqual(events, [nav, undefined]);
	});

	test('navigate callback updates context', () => {
		const host = new TestModalEditorNavigationHost();
		disposables.add({ dispose: () => host.dispose() });

		const navigatedIndices: number[] = [];

		const navigate = (index: number) => {
			navigatedIndices.push(index);
			// Simulates what real navigation does: update the context with new index
			host.updateOptions({ navigation: { total: 10, current: index, navigate } });
		};

		host.updateOptions({ navigation: { total: 10, current: 0, navigate } });

		// Navigate forward
		host.navigation!.navigate(1);
		assert.strictEqual(host.navigation!.current, 1);

		host.navigation!.navigate(5);
		assert.strictEqual(host.navigation!.current, 5);

		assert.deepStrictEqual(navigatedIndices, [1, 5]);
	});

	test('navigation boundary conditions', () => {
		const host = new TestModalEditorNavigationHost();
		disposables.add({ dispose: () => host.dispose() });

		const navigate = (index: number) => {
			if (index >= 0 && index < 3) {
				host.updateOptions({ navigation: { total: 3, current: index, navigate } });
			}
		};

		host.updateOptions({ navigation: { total: 3, current: 0, navigate } });

		// At first item
		assert.strictEqual(host.navigation!.current, 0);
		assert.ok(host.navigation!.current <= 0); // previous disabled

		// Navigate to last
		host.navigation!.navigate(2);
		assert.strictEqual(host.navigation!.current, 2);
		assert.ok(host.navigation!.current >= host.navigation!.total - 1); // next disabled

		// Navigate back to middle
		host.navigation!.navigate(1);
		assert.strictEqual(host.navigation!.current, 1);
	});

	test('navigation context fires multiple events', () => {
		const host = new TestModalEditorNavigationHost();
		disposables.add({ dispose: () => host.dispose() });

		let eventCount = 0;
		disposables.add(host.onDidChangeNavigation(() => eventCount++));

		const navigate = (index: number) => {
			host.updateOptions({ navigation: { total: 5, current: index, navigate } });
		};

		host.updateOptions({ navigation: { total: 5, current: 0, navigate } });
		host.navigation!.navigate(1);
		host.navigation!.navigate(2);
		host.updateOptions({ navigation: undefined });

		assert.strictEqual(eventCount, 4); // initial + 2 navigates + clear
	});
});
