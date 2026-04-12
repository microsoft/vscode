/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
/**
 * Simple test harness that mimics the ModalEditorPartImpl resize behavior
 * without requiring the full editor part infrastructure.
 */
class TestModalEditorResizeHost extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidChangeMaximized = this._register(new Emitter());
        this.onDidChangeMaximized = this._onDidChangeMaximized.event;
        this._onDidRequestLayout = this._register(new Emitter());
        this.onDidRequestLayout = this._onDidRequestLayout.event;
        this._maximized = false;
    }
    get maximized() { return this._maximized; }
    get size() { return this._size; }
    set size(value) { this._size = value; }
    get position() { return this._position; }
    set position(value) { this._position = value; }
    toggleMaximized() {
        this._maximized = !this._maximized;
        if (this._maximized) {
            this.savedSize = this._size;
            this.savedPosition = this._position;
        }
        else {
            this._size = this.savedSize;
            this._position = this.savedPosition;
            this.savedSize = undefined;
            this.savedPosition = undefined;
        }
        this._onDidChangeMaximized.fire(this._maximized);
    }
    handleHeaderDoubleClick() {
        if (this._maximized) {
            this.savedSize = undefined;
            this.savedPosition = undefined;
            this.toggleMaximized(); // un-maximize to default
        }
        else if (this._size) {
            this._size = undefined;
            this._position = undefined;
            this._onDidRequestLayout.fire();
        }
        else {
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
        const events = [];
        disposables.add(host.onDidChangeMaximized(v => events.push(v)));
        host.handleHeaderDoubleClick();
        assert.deepStrictEqual({ maximized: host.maximized, size: host.size, events }, { maximized: true, size: undefined, events: [true] });
    });
    test('double-click from maximized restores default', () => {
        const host = disposables.add(new TestModalEditorResizeHost());
        host.handleHeaderDoubleClick(); // maximize
        const events = [];
        disposables.add(host.onDidChangeMaximized(v => events.push(v)));
        host.handleHeaderDoubleClick(); // restore
        assert.deepStrictEqual({ maximized: host.maximized, size: host.size, events }, { maximized: false, size: undefined, events: [false] });
    });
    test('double-click from custom size restores default without firing maximized event', () => {
        const host = disposables.add(new TestModalEditorResizeHost());
        host.size = { width: 800, height: 600 };
        const maximizedEvents = [];
        let layoutRequested = false;
        disposables.add(host.onDidChangeMaximized(v => maximizedEvents.push(v)));
        disposables.add(host.onDidRequestLayout(() => { layoutRequested = true; }));
        host.handleHeaderDoubleClick();
        assert.deepStrictEqual({ maximized: host.maximized, size: host.size, maximizedEvents, layoutRequested }, { maximized: false, size: undefined, maximizedEvents: [], layoutRequested: true });
    });
    test('double-click cycle: custom → default → maximized → default', () => {
        const host = disposables.add(new TestModalEditorResizeHost());
        const events = [];
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
        assert.deepStrictEqual({ maximized: host.maximized, size: host.size, position: host.position }, { maximized: false, size: { width: 800, height: 600 }, position: { left: 100, top: 50 } });
    });
    test('double-click from maximized clears saved custom state', () => {
        const host = disposables.add(new TestModalEditorResizeHost());
        // Set custom size then maximize via toggleMaximized (saves state)
        host.size = { width: 800, height: 600 };
        host.toggleMaximized();
        assert.strictEqual(host.maximized, true);
        // Double-click to un-maximize: should go to default, not restore custom
        host.handleHeaderDoubleClick();
        assert.deepStrictEqual({ maximized: host.maximized, size: host.size }, { maximized: false, size: undefined });
    });
    test('double-click clears custom position along with size', () => {
        const host = disposables.add(new TestModalEditorResizeHost());
        host.size = { width: 800, height: 600 };
        host.position = { left: 100, top: 50 };
        host.handleHeaderDoubleClick();
        assert.deepStrictEqual({ size: host.size, position: host.position, maximized: host.maximized }, { size: undefined, position: undefined, maximized: false });
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
        assert.deepStrictEqual({ size: host2.size, position: host2.position, maximized: host2.maximized }, { size: { width: 900, height: 700 }, position: { left: 200, top: 100 }, maximized: false });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kYWxFZGl0b3JSZXNpemUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvcGFydHMvZWRpdG9yL21vZGFsRWRpdG9yUmVzaXplLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXRGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBT25HOzs7R0FHRztBQUNILE1BQU0seUJBQTBCLFNBQVEsVUFBVTtJQUFsRDs7UUFFa0IsMEJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBVyxDQUFDLENBQUM7UUFDdkUseUJBQW9CLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQztRQUVoRCx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNsRSx1QkFBa0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO1FBRXJELGVBQVUsR0FBRyxLQUFLLENBQUM7SUE0QzVCLENBQUM7SUEzQ0EsSUFBSSxTQUFTLEtBQWMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUdwRCxJQUFJLElBQUksS0FBd0IsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNwRCxJQUFJLElBQUksQ0FBQyxLQUF3QixJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUcxRCxJQUFJLFFB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