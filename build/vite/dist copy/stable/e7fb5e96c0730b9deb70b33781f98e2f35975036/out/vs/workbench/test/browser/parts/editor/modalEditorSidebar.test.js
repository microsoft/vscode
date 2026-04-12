/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const MODAL_MIN_WIDTH = 400;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 220;
/**
 * Minimal sidebar model that mirrors the `createSidebar` / `updateOptions`
 * logic in ModalEditorPart without requiring DOM or instantiation services.
 */
class TestModalEditorSidebarHost extends Disposable {
    get sidebarWidth() { return this._sidebarWidth; }
    get hasSidebar() { return this._hasSidebar; }
    get sidebarVisible() { return this._sidebarVisible; }
    get renderCount() { return this._renderCount; }
    get customWidth() { return this._customWidth; }
    constructor(customWidth, sidebarHidden) {
        super();
        this._onDidResize = this._register(new Emitter());
        this.onDidResize = this._onDidResize.event;
        this._onDidLayout = this._register(new Emitter());
        this.contentDisposable = this._register(new MutableDisposable());
        this._sidebarWidth = MODAL_SIDEBAR_DEFAULT_WIDTH;
        this._hasSidebar = false;
        this._sidebarVisible = true;
        this._renderCount = 0;
        /** Container width the modal occupies (simulates container.clientWidth). */
        this.containerWidth = 800;
        this._customWidth = customWidth;
        this._sidebarVisible = !sidebarHidden;
    }
    // --- sidebar management (mirrors createSidebar / updateContent) ---------
    addSidebar(content) {
        this._hasSidebar = true;
        this._sidebarWidth = this._customWidth ?? MODAL_SIDEBAR_DEFAULT_WIDTH;
        this.renderContent(content);
    }
    updateSidebarContent(content) {
        this.contentDisposable.clear();
        this.renderContent(content);
    }
    removeSidebar() {
        this._hasSidebar = false;
        this._sidebarWidth = 0;
        this.contentDisposable.clear();
    }
    toggleSidebarVisible() {
        this._sidebarVisible = !this._sidebarVisible;
        this._onDidResize.fire();
    }
    /** Returns actual width taking visibility into account (mirrors getWidth in controller). */
    get effectiveSidebarWidth() {
        return this._sidebarVisible ? this._sidebarWidth : 0;
    }
    renderContent(content) {
        this._renderCount++;
        this.contentDisposable.value = content.render({} /* stub container */, this._onDidLayout.event);
    }
    // --- resize (mirrors sash logic) ----------------------------------------
    resizeSidebar(delta) {
        const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.containerWidth - MODAL_MIN_WIDTH);
        this._sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, this._sidebarWidth + delta));
        this._customWidth = this._sidebarWidth;
        this._onDidResize.fire();
    }
    resetSidebarWidth() {
        const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.containerWidth - MODAL_MIN_WIDTH);
        this._sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
        this._customWidth = undefined;
        this._onDidResize.fire();
    }
    clampWidth(modalWidth) {
        if (this._sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
            this._sidebarWidth = Math.min(MODAL_SIDEBAR_DEFAULT_WIDTH, Math.max(MODAL_SIDEBAR_MIN_WIDTH, modalWidth - MODAL_MIN_WIDTH));
            this._customWidth = undefined;
            this._onDidResize.fire();
        }
    }
    // --- min-size computation (mirrors create method) -----------------------
    get effectiveMinWidth() {
        return MODAL_MIN_WIDTH + (this._hasSidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
    }
    // --- option propagation (mirrors updateOptions behaviour) ---------------
    updateOptions(options) {
        if (options.sidebar) {
            if (!this._hasSidebar) {
                this.addSidebar(options.sidebar);
            }
            else {
                this.updateSidebarContent(options.sidebar);
            }
        }
        else if (options.sidebar === undefined && this._hasSidebar) {
            // sidebar explicitly removed when key is absent and host has one
        }
    }
    layout(height) {
        this._onDidLayout.fire({ height, width: this._sidebarWidth });
    }
}
function stubSidebarContent() {
    return {
        render: (_container, _onDidLayout) => {
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
        assert.deepStrictEqual({ hasSidebar: host.hasSidebar, sidebarWidth: host.sidebarWidth, renderCount: host.renderCount }, { hasSidebar: true, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH, renderCount: 1 });
    });
    test('removeSidebar clears sidebar state', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        host.removeSidebar();
        assert.deepStrictEqual({ hasSidebar: host.hasSidebar, sidebarWidth: host.sidebarWidth, renderCount: host.renderCount }, { hasSidebar: false, sidebarWidth: 0, renderCount: 1 });
    });
    test('updateSidebarContent disposes previous content and re-renders', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        let firstDisposed = false;
        const firstContent = {
            render: () => ({ dispose: () => { firstDisposed = true; } })
        };
        host.addSidebar(firstContent);
        let secondRendered = false;
        const secondContent = {
            render: () => { secondRendered = true; return { dispose: () => { } }; }
        };
        host.updateSidebarContent(secondContent);
        assert.deepStrictEqual({ firstDisposed, secondRendered, renderCount: host.renderCount }, { firstDisposed: true, secondRendered: true, renderCount: 2 });
    });
    test('updateOptions adds sidebar when not present', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.updateOptions({ sidebar: stubSidebarContent() });
        assert.deepStrictEqual({ hasSidebar: host.hasSidebar, renderCount: host.renderCount }, { hasSidebar: true, renderCount: 1 });
    });
    test('updateOptions updates sidebar content when already present', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        host.updateOptions({ sidebar: stubSidebarContent() });
        assert.deepStrictEqual({ hasSidebar: host.hasSidebar, renderCount: host.renderCount }, { hasSidebar: true, renderCount: 2 });
    });
    // --- min-size constraints -----------------------------------------------
    test('effectiveMinWidth accounts for sidebar', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        const withoutSidebar = host.effectiveMinWidth;
        host.addSidebar(stubSidebarContent());
        const withSidebar = host.effectiveMinWidth;
        assert.deepStrictEqual({ withoutSidebar, withSidebar }, { withoutSidebar: MODAL_MIN_WIDTH, withSidebar: MODAL_MIN_WIDTH + MODAL_SIDEBAR_MIN_WIDTH });
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
    // --- width persistence ---------------------------------------------------
    test('addSidebar restores custom width when present', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(300));
        host.containerWidth = 1000;
        host.addSidebar(stubSidebarContent());
        assert.strictEqual(host.sidebarWidth, 300);
    });
    test('addSidebar uses default width when no custom width', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
    });
    test('resizeSidebar sets custom width', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.containerWidth = 1000;
        host.addSidebar(stubSidebarContent());
        host.resizeSidebar(50);
        assert.strictEqual(host.customWidth, MODAL_SIDEBAR_DEFAULT_WIDTH + 50);
    });
    test('resetSidebarWidth clears custom width', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.containerWidth = 1000;
        host.addSidebar(stubSidebarContent());
        host.resizeSidebar(50);
        host.resetSidebarWidth();
        assert.strictEqual(host.customWidth, undefined);
    });
    // --- clampWidth ---------------------------------------------------------
    test('clampWidth resets to default when sidebar is too wide for modal', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(500));
        host.containerWidth = 1000;
        host.addSidebar(stubSidebarContent());
        assert.strictEqual(host.sidebarWidth, 500);
        host.clampWidth(800); // 500 + 400 (MODAL_MIN_WIDTH) > 800, default 260 fits
        assert.deepStrictEqual({ sidebarWidth: host.sidebarWidth, customWidth: host.customWidth }, { sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH, customWidth: undefined });
    });
    test('clampWidth keeps width when sidebar fits within modal', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(300));
        host.containerWidth = 1000;
        host.addSidebar(stubSidebarContent());
        host.clampWidth(1000); // 300 + 400 (MODAL_MIN_WIDTH) <= 1000
        assert.deepStrictEqual({ sidebarWidth: host.sidebarWidth, customWidth: host.customWidth }, { sidebarWidth: 300, customWidth: 300 });
    });
    test('clampWidth fires onDidResize when clamping', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(500));
        host.addSidebar(stubSidebarContent());
        let fired = false;
        disposables.add(host.onDidResize(() => { fired = true; }));
        host.clampWidth(600);
        assert.strictEqual(fired, true);
    });
    test('clampWidth does not fire onDidResize when not clamping', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(200));
        host.addSidebar(stubSidebarContent());
        let fired = false;
        disposables.add(host.onDidResize(() => { fired = true; }));
        host.clampWidth(1000);
        assert.strictEqual(fired, false);
    });
    test('clampWidth uses constrained width when modal is very narrow', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(400));
        host.addSidebar(stubSidebarContent());
        host.clampWidth(500); // 400 + 400 > 500, default 260 + 400 > 500 too
        assert.deepStrictEqual({ sidebarWidth: host.sidebarWidth, customWidth: host.customWidth }, { sidebarWidth: MODAL_SIDEBAR_MIN_WIDTH, customWidth: undefined });
    });
    // --- layout propagation -------------------------------------------------
    test('layout fires onDidLayout with current dimensions', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        // Capture layout event by re-adding content that tracks it
        const layouts = [];
        const trackedContent = {
            render: (_container, onDidLayout) => {
                const sub = onDidLayout(e => layouts.push(e));
                return sub;
            }
        };
        host.updateSidebarContent(trackedContent);
        host.layout(500);
        assert.deepStrictEqual(layouts, [{ height: 500, width: MODAL_SIDEBAR_DEFAULT_WIDTH }]);
    });
    // --- sidebar visibility -------------------------------------------------
    test('sidebar is visible by default', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        assert.deepStrictEqual({ visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth }, { visible: true, effectiveWidth: MODAL_SIDEBAR_DEFAULT_WIDTH });
    });
    test('toggleSidebarVisible hides sidebar and returns zero width', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        host.toggleSidebarVisible();
        assert.deepStrictEqual({ visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth }, { visible: false, effectiveWidth: 0 });
    });
    test('toggleSidebarVisible twice restores sidebar', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        host.toggleSidebarVisible();
        host.toggleSidebarVisible();
        assert.deepStrictEqual({ visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth }, { visible: true, effectiveWidth: MODAL_SIDEBAR_DEFAULT_WIDTH });
    });
    test('toggleSidebarVisible fires onDidResize', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.addSidebar(stubSidebarContent());
        let fired = false;
        disposables.add(host.onDidResize(() => { fired = true; }));
        host.toggleSidebarVisible();
        assert.strictEqual(fired, true);
    });
    test('sidebar hidden state persists via constructor', () => {
        const host = disposables.add(new TestModalEditorSidebarHost(undefined, true));
        host.addSidebar(stubSidebarContent());
        assert.deepStrictEqual({ visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth }, { visible: false, effectiveWidth: 0 });
    });
    test('hidden sidebar preserves width for when restored', () => {
        const host = disposables.add(new TestModalEditorSidebarHost());
        host.containerWidth = 1000;
        host.addSidebar(stubSidebarContent());
        host.resizeSidebar(50);
        host.toggleSidebarVisible();
        assert.deepStrictEqual({ effectiveWidth: host.effectiveSidebarWidth, sidebarWidth: host.sidebarWidth }, { effectiveWidth: 0, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH + 50 });
        host.toggleSidebarVisible();
        assert.deepStrictEqual({ effectiveWidth: host.effectiveSidebarWidth, sidebarWidth: host.sidebarWidth }, { effectiveWidth: MODAL_SIDEBAR_DEFAULT_WIDTH + 50, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH + 50 });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kYWxFZGl0b3JTaWRlYmFyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL3BhcnRzL2VkaXRvci9tb2RhbEVkaXRvclNpZGViYXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEgsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHbkcsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDO0FBQzVCLE1BQU0sdUJBQXVCLEdBQUcsR0FBRyxDQUFDO0FBQ3BDLE1BQU0sMkJBQTJCLEdBQUcsR0FBRyxDQUFDO0FBRXhDOzs7R0FHRztBQUNILE1BQU0sMEJBQTJCLFNBQVEsVUFBVTtJQVVsRCxJQUFJLFlBQVksS0FBYSxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBR3pELElBQUksVUFBVSxLQUFjLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFHdEQsSUFBSSxjQUFjLEtBQWMsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztJQUc5RCxJQUFJLFdBQVcsS0FBYSxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBT3ZELElBQUksV0FBVyxLQUF5QixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBRW5FLFlBQVksV0FBb0IsRUFBRSxhQUF1QjtRQUN4RCxLQUFLLEVBQUUsQ0FBQztRQTNCUSxpQkFBWSxHQUFHLElBQUksQ0FBQyxT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