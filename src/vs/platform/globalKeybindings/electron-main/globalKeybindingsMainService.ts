/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { INativeSystemWideKeybinding, INativeSystemWideKeybindingResult } from '../../native/common/native.js';
import { INativeRunActionInWindowRequest } from '../../window/common/window.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';

/**
 * The subset of Electron's `globalShortcut` module that this service relies on. Injecting it as a
 * constructor dependency (rather than importing the global directly) lets tests provide a fake.
 */
export interface IGlobalShortcutRegistry {
	register(accelerator: string, callback: () => void): boolean;
	unregister(accelerator: string): void;
	isRegistered(accelerator: string): boolean;
}

export const IGlobalKeybindingsMainService = createDecorator<IGlobalKeybindingsMainService>('globalKeybindingsMainService');

export interface IGlobalKeybindingsMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Replaces the set of system-wide (OS global) keybindings owned by the given window with the
	 * provided set, reconciling the actual OS registrations. The result reports the user settings
	 * labels (or accelerators) that could not be registered (e.g. because the accelerator is already
	 * taken by the OS or another application).
	 */
	updateKeybindings(windowId: number, keybindings: readonly INativeSystemWideKeybinding[]): INativeSystemWideKeybindingResult;
}

export class GlobalKeybindingsMainService extends Disposable implements IGlobalKeybindingsMainService {

	declare readonly _serviceBrand: undefined;

	/** Per-window desired bindings, keyed by window id then by accelerator. */
	private readonly registry = new Map<number, Map<string, INativeSystemWideKeybinding>>();

	/** Accelerators this service currently owns an OS registration for. */
	private readonly registeredAccelerators = new Set<string>();

	/** Accelerators that were desired but failed to register (e.g. already taken). */
	private readonly failedAccelerators = new Set<string>();

	constructor(
		private readonly globalShortcut: IGlobalShortcutRegistry,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(this.windowsMainService.onDidDestroyWindow(window => this.onDidDestroyWindow(window)));
		this._register(lifecycleMainService.onWillShutdown(() => this.unregisterAll()));
		this._register(toDisposable(() => this.unregisterAll()));
	}

	updateKeybindings(windowId: number, keybindings: readonly INativeSystemWideKeybinding[]): INativeSystemWideKeybindingResult {
		const perWindow = new Map<string, INativeSystemWideKeybinding>();
		for (const keybinding of keybindings) {
			if (!this.isValid(keybinding)) {
				this.logService.warn(`[GlobalKeybindings] ignoring invalid system-wide keybinding: ${JSON.stringify(keybinding)}`);
				continue;
			}
			if (perWindow.has(keybinding.accelerator)) {
				this.logService.warn(`[GlobalKeybindings] duplicate accelerator '${keybinding.accelerator}' in window ${windowId}, keeping first`);
				continue;
			}
			perWindow.set(keybinding.accelerator, keybinding);
		}

		if (perWindow.size > 0) {
			this.registry.set(windowId, perWindow);
		} else {
			this.registry.delete(windowId);
		}

		this.reconcile();

		const failed: string[] = [];
		for (const keybinding of perWindow.values()) {
			if (this.failedAccelerators.has(keybinding.accelerator)) {
				failed.push(keybinding.userSettingsLabel ?? keybinding.accelerator);
			}
		}

		return { failed };
	}

	private isValid(keybinding: INativeSystemWideKeybinding): boolean {
		return typeof keybinding.accelerator === 'string' && keybinding.accelerator.length > 0
			&& typeof keybinding.commandId === 'string' && keybinding.commandId.length > 0;
	}

	/**
	 * Reconciles the OS registrations against the union of all windows' desired accelerators.
	 * Unregisters only accelerators this service owns; never touches shortcuts owned elsewhere.
	 */
	private reconcile(): void {
		const desired = new Set<string>();
		for (const perWindow of this.registry.values()) {
			for (const accelerator of perWindow.keys()) {
				desired.add(accelerator);
			}
		}

		// Unregister accelerators we own but no longer want
		for (const accelerator of [...this.registeredAccelerators]) {
			if (!desired.has(accelerator)) {
				this.globalShortcut.unregister(accelerator);
				this.registeredAccelerators.delete(accelerator);
				this.failedAccelerators.delete(accelerator);
			}
		}

		// Register newly desired accelerators (retries previously failed ones too)
		for (const accelerator of desired) {
			if (this.registeredAccelerators.has(accelerator)) {
				continue;
			}

			let registered = false;
			try {
				// Register once with a stable callback that reads the CURRENT registry at fire time,
				// so command/args are never captured from a stale snapshot.
				registered = this.globalShortcut.register(accelerator, () => this.onTrigger(accelerator));
			} catch (error) {
				this.logService.error(`[GlobalKeybindings] error registering '${accelerator}'`, error);
			}

			if (registered) {
				this.registeredAccelerators.add(accelerator);
				this.failedAccelerators.delete(accelerator);
			} else {
				this.failedAccelerators.add(accelerator);
				this.logService.warn(`[GlobalKeybindings] failed to register accelerator '${accelerator}' (already taken by the OS or another application)`);
			}
		}
	}

	private onTrigger(accelerator: string): void {
		const owners: number[] = [];
		for (const [windowId, perWindow] of this.registry) {
			if (perWindow.has(accelerator)) {
				owners.push(windowId);
			}
		}
		if (owners.length === 0) {
			return; // stale registration; will be unregistered on next reconcile
		}

		// Target window selection:
		// 1. the focused window if it owns this accelerator (respect that window's own binding)
		// 2. otherwise the deterministic winner (lowest window id) among alive owners
		let target: ICodeWindow | undefined;
		const focused = this.windowsMainService.getFocusedWindow();
		if (focused && this.registry.get(focused.id)?.has(accelerator)) {
			target = focused;
		} else {
			target = owners
				.map(windowId => this.windowsMainService.getWindowById(windowId))
				.filter((window): window is ICodeWindow => !!window)
				.sort((a, b) => a.id - b.id)
				.at(0);
		}

		if (!target) {
			this.logService.warn(`[GlobalKeybindings] no live window to handle accelerator '${accelerator}'`);
			return;
		}

		const binding = this.registry.get(target.id)?.get(accelerator);
		if (!binding) {
			return;
		}

		this.logService.trace(`[GlobalKeybindings] trigger '${accelerator}' -> '${binding.commandId}' in window ${target.id}`);

		// We deliberately do NOT focus the routing window here. A system-wide keybinding fires while
		// VS Code is typically unfocused, and force-focusing the routing window would pull it to the
		// foreground even when the command opens or reveals a *different* window (e.g.
		// `workbench.action.openAgentsWindow` reveals the agents window). Pulling the routing window
		// forward first produces a visible flicker. Instead we let the command decide what to surface
		// and focus — matching every other `vscode:runAction` sender (menubar, touchbar, mouse), none
		// of which force-focus. `sendWhenReady` only needs the web contents to be ready, not focused.
		const payload: INativeRunActionInWindowRequest = {
			id: binding.commandId,
			from: 'systemWideKeybinding',
			args: binding.args === undefined ? undefined : [binding.args]
		};
		target.sendWhenReady('vscode:runAction', CancellationToken.None, payload);
	}

	private onDidDestroyWindow(window: ICodeWindow): void {
		if (this.registry.delete(window.id)) {
			this.reconcile();
		}
	}

	private unregisterAll(): void {
		for (const accelerator of this.registeredAccelerators) {
			this.globalShortcut.unregister(accelerator);
		}
		this.registeredAccelerators.clear();
		this.failedAccelerators.clear();
		this.registry.clear();
	}
}
