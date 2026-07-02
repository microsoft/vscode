/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { INativeSystemWideKeybinding } from '../../../native/common/native.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { GlobalKeybindingsMainService, IGlobalShortcutRegistry } from '../../electron-main/globalKeybindingsMainService.js';

class FakeGlobalShortcut implements IGlobalShortcutRegistry {
	readonly registered = new Map<string, () => void>();
	readonly failFor = new Set<string>();
	unregisterCalls: string[] = [];

	register(accelerator: string, callback: () => void): boolean {
		if (this.failFor.has(accelerator)) {
			return false;
		}
		this.registered.set(accelerator, callback);
		return true;
	}

	unregister(accelerator: string): void {
		this.unregisterCalls.push(accelerator);
		this.registered.delete(accelerator);
	}

	isRegistered(accelerator: string): boolean {
		return this.registered.has(accelerator);
	}

	trigger(accelerator: string): void {
		const callback = this.registered.get(accelerator);
		if (!callback) {
			throw new Error(`accelerator '${accelerator}' is not registered`);
		}
		callback();
	}
}

class FakeCodeWindow {
	focusCalls = 0;
	readonly sent: { channel: string; args: unknown[] }[] = [];

	constructor(readonly id: number) { }

	focus(): void {
		this.focusCalls++;
	}

	sendWhenReady(channel: string, _token: unknown, ...args: unknown[]): void {
		this.sent.push({ channel, args });
	}
}

class FakeWindowsMainService {
	private readonly _onDidDestroyWindow: Emitter<ICodeWindow>;
	readonly onDidDestroyWindow;

	focused: FakeCodeWindow | undefined;
	readonly windows = new Map<number, FakeCodeWindow>();

	constructor(store: DisposableStore) {
		this._onDidDestroyWindow = store.add(new Emitter<ICodeWindow>());
		this.onDidDestroyWindow = this._onDidDestroyWindow.event;
	}

	addWindow(id: number): FakeCodeWindow {
		const window = new FakeCodeWindow(id);
		this.windows.set(id, window);
		return window;
	}

	getFocusedWindow(): ICodeWindow | undefined {
		return this.focused as unknown as ICodeWindow | undefined;
	}

	getWindowById(id: number): ICodeWindow | undefined {
		return this.windows.get(id) as unknown as ICodeWindow | undefined;
	}

	destroyWindow(window: FakeCodeWindow): void {
		this.windows.delete(window.id);
		this._onDidDestroyWindow.fire(window as unknown as ICodeWindow);
	}
}

class FakeLifecycleMainService {
	private readonly _onWillShutdown: Emitter<{ reason: number; join(id: string, promise: Promise<void>): void }>;
	readonly onWillShutdown;

	constructor(store: DisposableStore) {
		this._onWillShutdown = store.add(new Emitter());
		this.onWillShutdown = this._onWillShutdown.event;
	}

	shutdown(): void {
		this._onWillShutdown.fire({ reason: 1, join: () => { } });
	}
}

function binding(accelerator: string, commandId: string, args?: unknown, userSettingsLabel?: string): INativeSystemWideKeybinding {
	return { accelerator, commandId, args, userSettingsLabel };
}

suite('GlobalKeybindingsMainService', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(shortcut = new FakeGlobalShortcut()) {
		const store = ds.add(new DisposableStore());
		const windows = new FakeWindowsMainService(store);
		const lifecycle = new FakeLifecycleMainService(store);
		const service = store.add(new GlobalKeybindingsMainService(
			shortcut,
			windows as unknown as IWindowsMainService,
			lifecycle as unknown as ILifecycleMainService,
			new NullLogService()
		));
		return { service, windows, lifecycle, shortcut };
	}

	test('registers desired accelerators and reports no failures', () => {
		const { service, shortcut } = createService();
		const { failed } = service.updateKeybindings(1, [binding('Control+Cmd+A', 'a'), binding('Control+Cmd+B', 'b')]);

		assert.deepStrictEqual(failed, []);
		assert.deepStrictEqual([...shortcut.registered.keys()].sort(), ['Control+Cmd+A', 'Control+Cmd+B']);
	});

	test('reports and unregisters accelerators removed on a subsequent update', () => {
		const { service, shortcut } = createService();
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'a'), binding('Control+Cmd+B', 'b')]);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'a')]);

		assert.deepStrictEqual([...shortcut.registered.keys()], ['Control+Cmd+A']);
		assert.deepStrictEqual(shortcut.unregisterCalls, ['Control+Cmd+B']);
	});

	test('returns the labels that failed to register and retries them later', () => {
		const shortcut = new FakeGlobalShortcut();
		shortcut.failFor.add('Control+Cmd+A');
		const { service } = createService(shortcut);

		const { failed } = service.updateKeybindings(1, [binding('Control+Cmd+A', 'a', undefined, 'ctrl+cmd+a')]);
		assert.deepStrictEqual(failed, ['ctrl+cmd+a']);

		// Now the accelerator becomes available; a re-sync should register it.
		shortcut.failFor.delete('Control+Cmd+A');
		const { failed: failedAgain } = service.updateKeybindings(1, [binding('Control+Cmd+A', 'a', undefined, 'ctrl+cmd+a')]);
		assert.deepStrictEqual(failedAgain, []);
		assert.ok(shortcut.isRegistered('Control+Cmd+A'));
	});

	test('deduplicates accelerators within a single window payload', () => {
		const { service, shortcut } = createService();
		const { failed } = service.updateKeybindings(1, [binding('Control+Cmd+A', 'first'), binding('Control+Cmd+A', 'second')]);

		assert.deepStrictEqual(failed, []);
		assert.strictEqual(shortcut.registered.size, 1);
	});

	test('trigger dispatches the run-action payload without force-focusing the routing window', () => {
		const { service, windows, shortcut } = createService();
		const window = windows.addWindow(1);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'workbench.action.openAgentsWindow', { foo: 'bar' })]);

		shortcut.trigger('Control+Cmd+A');

		// The command controls what is surfaced/focused (e.g. it reveals the agents window), so the
		// routing window must NOT be pulled to the foreground — doing so would flicker the wrong window.
		assert.strictEqual(window.focusCalls, 0);
		assert.deepStrictEqual(window.sent, [{
			channel: 'vscode:runAction',
			args: [{ id: 'workbench.action.openAgentsWindow', from: 'systemWideKeybinding', args: [{ foo: 'bar' }] }]
		}]);
	});

	test('trigger passes undefined args when the binding has none', () => {
		const { service, windows, shortcut } = createService();
		const window = windows.addWindow(1);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'cmd')]);

		shortcut.trigger('Control+Cmd+A');

		assert.deepStrictEqual(window.sent[0].args, [{ id: 'cmd', from: 'systemWideKeybinding', args: undefined }]);
	});

	test('conflict across windows resolves to the focused owner', () => {
		const { service, windows, shortcut } = createService();
		const window1 = windows.addWindow(1);
		const window2 = windows.addWindow(2);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'from-window-1')]);
		service.updateKeybindings(2, [binding('Control+Cmd+A', 'from-window-2')]);

		windows.focused = window2;
		shortcut.trigger('Control+Cmd+A');

		assert.strictEqual(window1.sent.length, 0);
		assert.strictEqual((window2.sent[0].args[0] as { id: string }).id, 'from-window-2');
	});

	test('conflict without a focused owner resolves deterministically to the lowest window id', () => {
		const { service, windows, shortcut } = createService();
		const window1 = windows.addWindow(1);
		const window2 = windows.addWindow(2);
		service.updateKeybindings(2, [binding('Control+Cmd+A', 'from-window-2')]);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'from-window-1')]);

		windows.focused = undefined;
		shortcut.trigger('Control+Cmd+A');

		assert.strictEqual(window2.sent.length, 0);
		assert.strictEqual((window1.sent[0].args[0] as { id: string }).id, 'from-window-1');
	});

	test('closing a window unregisters accelerators no other window owns', () => {
		const { service, windows, shortcut } = createService();
		const window1 = windows.addWindow(1);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'a')]);
		assert.ok(shortcut.isRegistered('Control+Cmd+A'));

		windows.destroyWindow(window1);
		assert.strictEqual(shortcut.isRegistered('Control+Cmd+A'), false);
	});

	test('closing a window keeps accelerators still owned by another window', () => {
		const { service, windows, shortcut } = createService();
		const window1 = windows.addWindow(1);
		windows.addWindow(2);
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'a')]);
		service.updateKeybindings(2, [binding('Control+Cmd+A', 'a')]);

		windows.destroyWindow(window1);
		assert.ok(shortcut.isRegistered('Control+Cmd+A'));
	});

	test('shutdown unregisters all owned accelerators', () => {
		const { service, lifecycle, shortcut } = createService();
		service.updateKeybindings(1, [binding('Control+Cmd+A', 'a'), binding('Control+Cmd+B', 'b')]);

		lifecycle.shutdown();
		assert.strictEqual(shortcut.registered.size, 0);
	});
});
