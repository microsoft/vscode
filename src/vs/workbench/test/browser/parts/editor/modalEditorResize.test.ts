/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

interface ISize {
	readonly width: number;
	readonly height: number;
}

/**
 * Simple test harness that mimics the ModalEditorPartImpl resize behavior
 * without requiring the full editor part infrastructure.
 */
class TestModalEditorResizeHost extends Disposable {

	private readonly _onDidChangeMaximized = this._register(new Emitter<boolean>());
	readonly onDidChangeMaximized = this._onDidChangeMaximized.event;

	private readonly _onDidRequestLayout = this._register(new Emitter<void>());
	readonly onDidRequestLayout = this._onDidRequestLayout.event;

	private _maximized = false;
	get maximized(): boolean { return this._maximized; }

	private _size: ISize | undefined;
	get size(): ISize | undefined { return this._size; }
	set size(value: ISize | undefined) { this._size = value; }

	private _position: { left: number; top: number } | undefined;
	get position(): { left: number; top: number } | undefined { return this._position; }
	set position(value: { left: number; top: number } | undefined) { this._position = value; }

	private savedSize: ISize | undefined;
	private savedPosition: { left: number; top: number } | undefined;

	toggleMaximized(): void {
		this._maximized = !this._maximized;

		if (this._maximized) {
			this.savedSize = this._size;
			this.savedPosition = this._position;
		} else {
			this._size = this.savedSize;
			this._position = this.savedPosition;
			this.savedSize = undefined;
			this.savedPosition = undefined;
		}

		this._onDidChangeMaximized.fire(this._maximized);
	}

	handleHeaderDoubleClick(): void {
		if (this._maximized) {
			this.savedSize = undefined;
			this.savedPosition = undefined;
			this.toggleMaximized(); // un-maximize to default
		} else if (this._size) {
			this._size = undefined;
			this._position = undefined;
			this._onDidRequestLayout.fire();
		} else {
			this.toggleMaximized(); // maximize
		}
	}

}

suite('Modal Editor Resize', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('double-click from default size maximizes', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		const events: boolean[] = [];
		disposables.add(host.onDidChangeMaximized(v => events.push(v)));

		host.handleHeaderDoubleClick();

		assert.deepStrictEqual(
			{ maximized: host.maximized, size: host.size, events },
			{ maximized: true, size: undefined, events: [true] }
		);
	});

	test('double-click from maximized restores default', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		host.handleHeaderDoubleClick(); // maximize

		const events: boolean[] = [];
		disposables.add(host.onDidChangeMaximized(v => events.push(v)));

		host.handleHeaderDoubleClick(); // restore

		assert.deepStrictEqual(
			{ maximized: host.maximized, size: host.size, events },
			{ maximized: false, size: undefined, events: [false] }
		);
	});

	test('double-click from custom size restores default without firing maximized event', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		host.size = { width: 800, height: 600 };

		const maximizedEvents: boolean[] = [];
		let layoutRequested = false;
		disposables.add(host.onDidChangeMaximized(v => maximizedEvents.push(v)));
		disposables.add(host.onDidRequestLayout(() => { layoutRequested = true; }));

		host.handleHeaderDoubleClick();

		assert.deepStrictEqual(
			{ maximized: host.maximized, size: host.size, maximizedEvents, layoutRequested },
			{ maximized: false, size: undefined, maximizedEvents: [], layoutRequested: true }
		);
	});

	test('double-click cycle: custom → default → maximized → default', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		const events: boolean[] = [];
		disposables.add(host.onDidChangeMaximized(v => events.push(v)));

		// Start with custom size
		host.size = { width: 800, height: 600 };

		// First double-click: custom → default (fires layout, not maximized)
		host.handleHeaderDoubleClick();
		assert.strictEqual(host.maximized, false);
		assert.strictEqual(host.size, undefined);

		// Second double-click: default → maximized
		host.handleHeaderDoubleClick();
		assert.strictEqual(host.maximized, true);
		assert.strictEqual(host.size, undefined);

		// Third double-click: maximized → default
		host.handleHeaderDoubleClick();
		assert.strictEqual(host.maximized, false);
		assert.strictEqual(host.size, undefined);

		assert.deepStrictEqual(events, [true, false]);
	});

	test('toggleMaximized preserves custom state through maximize/un-maximize cycle', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		host.size = { width: 800, height: 600 };
		host.position = { left: 100, top: 50 };

		host.toggleMaximized();
		assert.strictEqual(host.maximized, true);

		host.toggleMaximized();
		assert.deepStrictEqual(
			{ maximized: host.maximized, size: host.size, position: host.position },
			{ maximized: false, size: { width: 800, height: 600 }, position: { left: 100, top: 50 } }
		);
	});

	test('double-click from maximized clears saved custom state', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		// Set custom size then maximize via toggleMaximized (saves state)
		host.size = { width: 800, height: 600 };
		host.toggleMaximized();
		assert.strictEqual(host.maximized, true);

		// Double-click to un-maximize: should go to default, not restore custom
		host.handleHeaderDoubleClick();
		assert.deepStrictEqual(
			{ maximized: host.maximized, size: host.size },
			{ maximized: false, size: undefined }
		);
	});

	test('double-click clears custom position along with size', () => {
		const host = disposables.add(new TestModalEditorResizeHost());

		host.size = { width: 800, height: 600 };
		host.position = { left: 100, top: 50 };

		host.handleHeaderDoubleClick();

		assert.deepStrictEqual(
			{ size: host.size, position: host.position, maximized: host.maximized },
			{ size: undefined, position: undefined, maximized: false }
		);
	});

	test('session persistence: state can be saved and restored across instances', () => {
		const host1 = disposables.add(new TestModalEditorResizeHost());

		host1.size = { width: 900, height: 700 };
		host1.position = { left: 200, top: 100 };

		// Simulate saving state on close
		const savedState = {
			size: host1.size,
			position: host1.position,
			maximized: host1.maximized,
		};

		// Simulate restoring state on new modal
		const host2 = disposables.add(new TestModalEditorResizeHost());
		host2.size = savedState.size;
		host2.position = savedState.position;
		if (savedState.maximized) {
			host2.toggleMaximized();
		}

		assert.deepStrictEqual(
			{ size: host2.size, position: host2.position, maximized: host2.maximized },
			{ size: { width: 900, height: 700 }, position: { left: 200, top: 100 }, maximized: false }
		);
	});
});
