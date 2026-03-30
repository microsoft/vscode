/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModalEditorPartOptions, IModalEditorSidebarContent } from '../../../../../platform/editor/common/editor.js';

const MODAL_MIN_WIDTH = 400;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 220;

/**
 * Minimal sidebar model that mirrors the `createSidebar` / `updateOptions`
 * logic in ModalEditorPart without requiring DOM or instantiation services.
 */
class TestModalEditorSidebarHost extends Disposable {

	private readonly _onDidResize = this._register(new Emitter<void>());
	readonly onDidResize = this._onDidResize.event;

	private readonly _onDidLayout = this._register(new Emitter<{ readonly height: number; readonly width: number }>());

	private readonly contentDisposable = this._register(new MutableDisposable());

	private _sidebarWidth = MODAL_SIDEBAR_DEFAULT_WIDTH;
	get sidebarWidth(): number { return this._sidebarWidth; }

	private _hasSidebar = false;
	get hasSidebar(): boolean { return this._hasSidebar; }

	private _renderCount = 0;
	get renderCount(): number { return this._renderCount; }

	/** Container width the modal occupies (simulates container.clientWidth). */
	containerWidth = 800;

	// --- sidebar management (mirrors createSidebar / updateContent) ---------

	addSidebar(content: IModalEditorSidebarContent): void {
		this._hasSidebar = true;
		this._sidebarWidth = MODAL_SIDEBAR_DEFAULT_WIDTH;
		this.renderContent(content);
	}

	updateSidebarContent(content: IModalEditorSidebarContent): void {
		this.contentDisposable.clear();
		this.renderContent(content);
	}

	removeSidebar(): void {
		this._hasSidebar = false;
		this._sidebarWidth = 0;
		this.contentDisposable.clear();
	}

	private renderContent(content: IModalEditorSidebarContent): void {
		this._renderCount++;
		this.contentDisposable.value = content.render({} /* stub container */, this._onDidLayout.event);
	}

	// --- resize (mirrors sash logic) ----------------------------------------

	resizeSidebar(delta: number): void {
		const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.containerWidth - MODAL_MIN_WIDTH);
		this._sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, this._sidebarWidth + delta));
		this._onDidResize.fire();
	}

	resetSidebarWidth(): void {
		const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.containerWidth - MODAL_MIN_WIDTH);
		this._sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
		this._onDidResize.fire();
	}

	// --- min-size computation (mirrors create method) -----------------------

	get effectiveMinWidth(): number {
		return MODAL_MIN_WIDTH + (this._hasSidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
	}

	// --- option propagation (mirrors updateOptions behaviour) ---------------

	updateOptions(options: IModalEditorPartOptions): void {
		if (options.sidebar) {
			if (!this._hasSidebar) {
				this.addSidebar(options.sidebar);
			} else {
				this.updateSidebarContent(options.sidebar);
			}
		} else if (options.sidebar === undefined && this._hasSidebar) {
			// sidebar explicitly removed when key is absent and host has one
		}
	}

	layout(height: number): void {
		this._onDidLayout.fire({ height, width: this._sidebarWidth });
	}
}

function stubSidebarContent(): IModalEditorSidebarContent {
	return {
		render: (_container: unknown, _onDidLayout: Event<{ readonly height: number; readonly width: number }>): IDisposable => {
			return { dispose: () => { } };
		}
	};
}

suite('Modal Editor Sidebar', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- option propagation -------------------------------------------------

	test('addSidebar sets hasSidebar and default width', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		host.addSidebar(stubSidebarContent());

		assert.deepStrictEqual(
			{ hasSidebar: host.hasSidebar, sidebarWidth: host.sidebarWidth, renderCount: host.renderCount },
			{ hasSidebar: true, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH, renderCount: 1 }
		);
	});

	test('removeSidebar clears sidebar state', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		host.addSidebar(stubSidebarContent());
		host.removeSidebar();

		assert.deepStrictEqual(
			{ hasSidebar: host.hasSidebar, sidebarWidth: host.sidebarWidth, renderCount: host.renderCount },
			{ hasSidebar: false, sidebarWidth: 0, renderCount: 1 }
		);
	});

	test('updateSidebarContent disposes previous content and re-renders', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		let firstDisposed = false;
		const firstContent: IModalEditorSidebarContent = {
			render: () => ({ dispose: () => { firstDisposed = true; } })
		};
		host.addSidebar(firstContent);

		let secondRendered = false;
		const secondContent: IModalEditorSidebarContent = {
			render: () => { secondRendered = true; return { dispose: () => { } }; }
		};
		host.updateSidebarContent(secondContent);

		assert.deepStrictEqual(
			{ firstDisposed, secondRendered, renderCount: host.renderCount },
			{ firstDisposed: true, secondRendered: true, renderCount: 2 }
		);
	});

	test('updateOptions adds sidebar when not present', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		host.updateOptions({ sidebar: stubSidebarContent() });

		assert.deepStrictEqual(
			{ hasSidebar: host.hasSidebar, renderCount: host.renderCount },
			{ hasSidebar: true, renderCount: 1 }
		);
	});

	test('updateOptions updates sidebar content when already present', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		host.addSidebar(stubSidebarContent());
		host.updateOptions({ sidebar: stubSidebarContent() });

		assert.deepStrictEqual(
			{ hasSidebar: host.hasSidebar, renderCount: host.renderCount },
			{ hasSidebar: true, renderCount: 2 }
		);
	});

	// --- min-size constraints -----------------------------------------------

	test('effectiveMinWidth accounts for sidebar', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		const withoutSidebar = host.effectiveMinWidth;

		host.addSidebar(stubSidebarContent());
		const withSidebar = host.effectiveMinWidth;

		assert.deepStrictEqual(
			{ withoutSidebar, withSidebar },
			{ withoutSidebar: MODAL_MIN_WIDTH, withSidebar: MODAL_MIN_WIDTH + MODAL_SIDEBAR_MIN_WIDTH }
		);
	});

	test('effectiveMinWidth reverts after sidebar removal', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());

		host.addSidebar(stubSidebarContent());
		host.removeSidebar();

		assert.strictEqual(host.effectiveMinWidth, MODAL_MIN_WIDTH);
	});

	// --- resize constraints -------------------------------------------------

	test('resizeSidebar clamps to min width', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.addSidebar(stubSidebarContent());

		host.resizeSidebar(-9999);

		assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_MIN_WIDTH);
	});

	test('resizeSidebar clamps to max width (container - modal min)', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.containerWidth = 800;
		host.addSidebar(stubSidebarContent());

		host.resizeSidebar(9999);

		assert.strictEqual(host.sidebarWidth, host.containerWidth - MODAL_MIN_WIDTH);
	});

	test('resizeSidebar applies delta within bounds', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.containerWidth = 1000;
		host.addSidebar(stubSidebarContent());

		host.resizeSidebar(30);

		assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_DEFAULT_WIDTH + 30);
	});

	test('resizeSidebar fires onDidResize', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.addSidebar(stubSidebarContent());

		let fired = false;
		disposables.add(host.onDidResize(() => { fired = true; }));

		host.resizeSidebar(10);

		assert.strictEqual(fired, true);
	});

	test('resetSidebarWidth restores default width', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.containerWidth = 1000;
		host.addSidebar(stubSidebarContent());

		host.resizeSidebar(100);
		host.resetSidebarWidth();

		assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
	});

	test('resetSidebarWidth clamps if container shrunk', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.containerWidth = 1000;
		host.addSidebar(stubSidebarContent());

		// Shrink container so that default width exceeds max
		host.containerWidth = MODAL_MIN_WIDTH + MODAL_SIDEBAR_MIN_WIDTH;
		host.resetSidebarWidth();

		assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_MIN_WIDTH);
	});

	// --- layout propagation -------------------------------------------------

	test('layout fires onDidLayout with current dimensions', () => {
		const host = disposables.add(new TestModalEditorSidebarHost());
		host.addSidebar(stubSidebarContent());

		// Capture layout event by re-adding content that tracks it
		const layouts: { height: number; width: number }[] = [];
		const trackedContent: IModalEditorSidebarContent = {
			render: (_container, onDidLayout) => {
				const sub = onDidLayout(e => layouts.push(e));
				return sub;
			}
		};
		host.updateSidebarContent(trackedContent);

		host.layout(500);

		assert.deepStrictEqual(layouts, [{ height: 500, width: MODAL_SIDEBAR_DEFAULT_WIDTH }]);
	});
});
