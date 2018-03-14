/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nativeKeymap from 'native-keymap';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IStateService } from 'vs/platform/state/common/state';
import Event, { Emitter, once } from 'vs/base/common/event';
import { ConfigWatcher } from 'vs/base/node/config';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ipcMain as ipc } from 'electron';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { ILogService } from 'vs/platform/log/common/log';

export class KeyboardLayoutMonitor {

	public static readonly INSTANCE = new KeyboardLayoutMonitor();

	private readonly _emitter: Emitter<void>;
	private _registered: boolean;

	private constructor() {
		this._emitter = new Emitter<void>();
		this._registered = false;
	}

	public onDidChangeKeyboardLayout(callback: () => void): IDisposable {
		if (!this._registered) {
			this._registered = true;

			nativeKeymap.onDidChangeKeyboardLayout(() => {
				this._emitter.fire();
			});
		}
		return this._emitter.event(callback);
	}
}

export interface IKeybinding {
	id: string;
	label: string;
	isNative: boolean;
}

export class KeybindingsResolver {

	private static readonly lastKnownKeybindingsMapStorageKey = 'lastKnownKeybindings';

	private commandIds: Set<string>;
	private keybindings: { [commandId: string]: IKeybinding };
	private keybindingsWatcher: ConfigWatcher<IUserFriendlyKeybinding[]>;

	private _onKeybindingsChanged = new Emitter<void>();
	onKeybindingsChanged: Event<void> = this._onKeybindingsChanged.event;

	constructor(
		@IStateService private stateService: IStateService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWindowsMainService private windowsMainService: IWindowsMainService,
		@ILogService private logService: ILogService
	) {
		this.commandIds = new Set<string>();
		this.keybindings = this.stateService.getItem<{ [id: string]: string; }>(KeybindingsResolver.lastKnownKeybindingsMapStorageKey) || Object.create(null);
		this.keybindingsWatcher = new ConfigWatcher<IUserFriendlyKeybinding[]>(environmentService.appKeybindingsPath, { changeBufferDelay: 100, onError: error => this.logService.error(error) });

		this.registerListeners();
	}

	private registerListeners(): void {

		// Listen to resolved keybindings from window
		ipc.on('vscode:keybindingsResolved', (event, rawKeybindings: string) => {
			let keybindings: IKeybinding[] = [];
			try {
				keybindings = JSON.parse(rawKeybindings);
			} catch (error) {
				// Should not happen
			}

			// Fill hash map of resolved keybindings and check for changes
			let keybindingsChanged = false;
			let keybindingsCount = 0;
			const resolvedKeybindings: { [commandId: string]: IKeybinding } = Object.create(null);
			keybindings.forEach(keybinding => {
				keybindingsCount++;

				resolvedKeybindings[keybinding.id] = keybinding;

				if (!this.keybindings[keybinding.id] || keybinding.label !== this.keybindings[keybinding.id].label) {
					keybindingsChanged = true;
				}
			});

			// A keybinding might have been unassigned, so we have to account for that too
			if (Object.keys(this.keybindings).length !== keybindingsCount) {
				keybindingsChanged = true;
			}

			if (keybindingsChanged) {
				this.keybindings = resolvedKeybindings;
				this.stateService.setItem(KeybindingsResolver.lastKnownKeybindingsMapStorageKey, this.keybindings); // keep to restore instantly after restart

				this._onKeybindingsChanged.fire();
			}
		});

		// Resolve keybindings when any first window is loaded
		const onceOnWindowReady = once(this.windowsMainService.onWindowReady);
		onceOnWindowReady(win => this.resolveKeybindings(win));

		// Resolve keybindings again when keybindings.json changes
		this.keybindingsWatcher.onDidUpdateConfiguration(() => this.resolveKeybindings());

		// Resolve keybindings when window reloads because an installed extension could have an impact
		this.windowsMainService.onWindowReload(() => this.resolveKeybindings());
	}

	private resolveKeybindings(win = this.windowsMainService.getLastActiveWindow()): void {
		if (this.commandIds.size && win) {
			const commandIds: string[] = [];
			this.commandIds.forEach(id => commandIds.push(id));
			win.sendWhenReady('vscode:resolveKeybindings', JSON.stringify(commandIds));
		}
	}

	public getKeybinding(commandId: string): IKeybinding {
		if (!commandId) {
			return void 0;
		}

		if (!this.commandIds.has(commandId)) {
			this.commandIds.add(commandId);
		}

		return this.keybindings[commandId];
	}

	public dispose(): void {
		this._onKeybindingsChanged.dispose();
		this.keybindingsWatcher.dispose();
	}
}