/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDriver, DriverChannel, IElement, IWindowDriverChannel, WindowDriverChannelClient, IWindowDriverRegistry, WindowDriverRegistryChannel, IWindowDriver } from 'vs/platform/driver/common/driver';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { serve as serveNet } from 'vs/base/parts/ipc/node/ipc.net';
import { combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPCServer, IClientRouter } from 'vs/base/parts/ipc/common/ipc';
import { SimpleKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { OS } from 'vs/base/common/platform';
import { Emitter, toPromise } from 'vs/base/common/event';

// TODO@joao: bad layering!
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';

class WindowRouter implements IClientRouter {

	constructor(private windowId: number) { }

	route(command: string, arg: any): string {
		return `window:${this.windowId}`;
	}
}

function isSilentKeyCode(keyCode: KeyCode) {
	return keyCode < KeyCode.KEY_0;
}

export class Driver implements IDriver, IWindowDriverRegistry {

	_serviceBrand: any;

	private registeredWindowIds = new Set<number>();
	private reloadingWindowIds = new Set<number>();
	private onDidReloadingChange = new Emitter<void>();

	constructor(
		private windowServer: IPCServer,
		@IWindowsMainService private windowsService: IWindowsMainService
	) { }

	async registerWindowDriver(windowId: number): TPromise<void> {
		this.registeredWindowIds.add(windowId);
		this.reloadingWindowIds.delete(windowId);
		this.onDidReloadingChange.fire();
	}

	async reloadWindowDriver(windowId: number): TPromise<void> {
		this.reloadingWindowIds.add(windowId);
	}

	async getWindowIds(): TPromise<number[]> {
		return this.windowsService.getWindows()
			.map(w => w.id)
			.filter(id => this.registeredWindowIds.has(id) && !this.reloadingWindowIds.has(id));
	}

	async reloadWindow(windowId: number): TPromise<void> {
		await this.whenUnfrozen(windowId);

		const window = this.windowsService.getWindowById(windowId);
		this.reloadingWindowIds.add(windowId);
		window.reload();
	}

	async dispatchKeybinding(windowId: number, keybinding: string): TPromise<void> {
		await this.whenUnfrozen(windowId);

		const [first, second] = KeybindingIO._readUserBinding(keybinding);

		await this._dispatchKeybinding(windowId, first);

		if (second) {
			await this._dispatchKeybinding(windowId, second);
		}
	}

	private async _dispatchKeybinding(windowId: number, keybinding: SimpleKeybinding | ScanCodeBinding): TPromise<void> {
		if (keybinding instanceof ScanCodeBinding) {
			throw new Error('ScanCodeBindings not supported');
		}

		const window = this.windowsService.getWindowById(windowId);
		const webContents = window.win.webContents;
		const noModifiedKeybinding = new SimpleKeybinding(false, false, false, false, keybinding.keyCode);
		const resolvedKeybinding = new USLayoutResolvedKeybinding(noModifiedKeybinding, OS);
		const keyCode = resolvedKeybinding.getElectronAccelerator();

		const modifiers = [];

		if (keybinding.ctrlKey) {
			modifiers.push('ctrl');
		}

		if (keybinding.metaKey) {
			modifiers.push('meta');
		}

		if (keybinding.shiftKey) {
			modifiers.push('shift');
		}

		if (keybinding.altKey) {
			modifiers.push('alt');
		}

		webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers } as any);

		if (!isSilentKeyCode(keybinding.keyCode)) {
			webContents.sendInputEvent({ type: 'char', keyCode, modifiers } as any);
		}

		webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers } as any);

		await TPromise.timeout(100);
	}

	async click(windowId: number, selector: string, xoffset?: number, yoffset?: number): TPromise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.click(selector, xoffset, yoffset);
	}

	async doubleClick(windowId: number, selector: string): TPromise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.doubleClick(selector);
	}

	async move(windowId: number, selector: string): TPromise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.move(selector);
	}

	async setValue(windowId: number, selector: string, text: string): TPromise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.setValue(selector, text);
	}

	async getTitle(windowId: number): TPromise<string> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.getTitle();
	}

	async isActiveElement(windowId: number, selector: string): TPromise<boolean> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.isActiveElement(selector);
	}

	async getElements(windowId: number, selector: string, recursive: boolean): TPromise<IElement[]> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.getElements(selector, recursive);
	}

	async typeInEditor(windowId: number, selector: string, text: string): TPromise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.typeInEditor(selector, text);
	}

	async getTerminalBuffer(windowId: number, selector: string): TPromise<string[]> {
		const windowDriver = await this.getWindowDriver(windowId);
		return windowDriver.getTerminalBuffer(selector);
	}

	private async getWindowDriver(windowId: number): TPromise<IWindowDriver> {
		await this.whenUnfrozen(windowId);

		const router = new WindowRouter(windowId);
		const windowDriverChannel = this.windowServer.getChannel<IWindowDriverChannel>('windowDriver', router);
		return new WindowDriverChannelClient(windowDriverChannel);
	}

	private async whenUnfrozen(windowId: number): TPromise<void> {
		while (this.reloadingWindowIds.has(windowId)) {
			await toPromise(this.onDidReloadingChange.event);
		}
	}
}

export async function serve(
	windowServer: IPCServer,
	handle: string,
	instantiationService: IInstantiationService
): TPromise<IDisposable> {
	const driver = instantiationService.createInstance(Driver, windowServer);

	const windowDriverRegistryChannel = new WindowDriverRegistryChannel(driver);
	windowServer.registerChannel('windowDriverRegistry', windowDriverRegistryChannel);

	const server = await serveNet(handle);
	const channel = new DriverChannel(driver);
	server.registerChannel('driver', channel);

	return combinedDisposable([server, windowServer]);
}