/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IDriver, DriverChannel, IElement, IWindowDriverChannel, WindowDriverChannelClient, IWindowDriverRegistry, WindowDriverRegistryChannel, IWindowDriver, IDriverOptions } from 'vs/platform/driver/node/driver';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { serve as serveNet } from 'vs/base/parts/ipc/node/ipc.net';
import { combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPCServer, IClientRouter } from 'vs/base/parts/ipc/node/ipc';
import { SimpleKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { OS } from 'vs/base/common/platform';
import { Emitter, toPromise } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ScanCodeBinding } from 'vs/base/common/scanCode';
import { KeybindingParser } from 'vs/base/common/keybindingParser';
import { timeout } from 'vs/base/common/async';

class WindowRouter implements IClientRouter {

	constructor(private windowId: number) { }

	routeCall(): TPromise<string> {
		return TPromise.as(`window:${this.windowId}`);
	}

	routeEvent(): TPromise<string> {
		return TPromise.as(`window:${this.windowId}`);
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
		private options: IDriverOptions,
		@IWindowsMainService private windowsService: IWindowsMainService
	) { }

	registerWindowDriver(windowId: number): TPromise<IDriverOptions> {
		this.registeredWindowIds.add(windowId);
		this.reloadingWindowIds.delete(windowId);
		this.onDidReloadingChange.fire();
		return TPromise.as(this.options);
	}

	reloadWindowDriver(windowId: number): TPromise<void> {
		this.reloadingWindowIds.add(windowId);
		return TPromise.as(null);
	}

	getWindowIds(): TPromise<number[]> {
		return TPromise.as(this.windowsService.getWindows()
			.map(w => w.id)
			.filter(id => this.registeredWindowIds.has(id) && !this.reloadingWindowIds.has(id)));
	}

	capturePage(windowId: number): TPromise<string> {
		return this.whenUnfrozen(windowId).then(() => {
			const window = this.windowsService.getWindowById(windowId);
			const webContents = window.win.webContents;
			return new TPromise(c => webContents.capturePage(image => c(image.toPNG().toString('base64'))));
		});
	}

	reloadWindow(windowId: number): TPromise<void> {
		return this.whenUnfrozen(windowId).then(() => {
			const window = this.windowsService.getWindowById(windowId);
			this.reloadingWindowIds.add(windowId);
			this.windowsService.reload(window);
		});
	}

	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void> {
		return this.whenUnfrozen(windowId).then(() => {
			const [first, second] = KeybindingParser.parseUserBinding(keybinding);

			return this._dispatchKeybinding(windowId, first).then(() => {
				if (second) {
					return this._dispatchKeybinding(windowId, second);
				} else {
					return TPromise.as(null);
				}
			});
		});
	}

	private _dispatchKeybinding(windowId: number, keybinding: SimpleKeybinding | ScanCodeBinding): TPromise<void> {
		if (keybinding instanceof ScanCodeBinding) {
			return TPromise.wrapError(new Error('ScanCodeBindings not supported'));
		}

		const window = this.windowsService.getWindowById(windowId);
		const webContents = window.win.webContents;
		const noModifiedKeybinding = new SimpleKeybinding(false, false, false, false, keybinding.keyCode);
		const resolvedKeybinding = new USLayoutResolvedKeybinding(noModifiedKeybinding, OS);
		const keyCode = resolvedKeybinding.getElectronAccelerator();

		const modifiers: string[] = [];

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

		return TPromise.wrap(timeout(100));
	}

	click(windowId: number, selector: string, xoffset?: number, yoffset?: number): TPromise<void> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.click(selector, xoffset, yoffset);
		});
	}

	doubleClick(windowId: number, selector: string): TPromise<void> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.doubleClick(selector);
		});
	}

	setValue(windowId: number, selector: string, text: string): TPromise<void> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.setValue(selector, text);
		});
	}

	getTitle(windowId: number): TPromise<string> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.getTitle();
		});
	}

	isActiveElement(windowId: number, selector: string): TPromise<boolean> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.isActiveElement(selector);
		});
	}

	getElements(windowId: number, selector: string, recursive: boolean): TPromise<IElement[]> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.getElements(selector, recursive);
		});
	}

	typeInEditor(windowId: number, selector: string, text: string): TPromise<void> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.typeInEditor(selector, text);
		});
	}

	getTerminalBuffer(windowId: number, selector: string): TPromise<string[]> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.getTerminalBuffer(selector);
		});
	}

	writeInTerminal(windowId: number, selector: string, text: string): TPromise<void> {
		return this.getWindowDriver(windowId).then(windowDriver => {
			return windowDriver.writeInTerminal(selector, text);
		});
	}

	private getWindowDriver(windowId: number): TPromise<IWindowDriver> {
		return this.whenUnfrozen(windowId).then(() => {
			const router = new WindowRouter(windowId);
			const windowDriverChannel = this.windowServer.getChannel<IWindowDriverChannel>('windowDriver', router);
			return new WindowDriverChannelClient(windowDriverChannel);
		});
	}

	private whenUnfrozen(windowId: number): TPromise<void> {
		return TPromise.wrap(this._whenUnfrozen(windowId));
	}

	private async _whenUnfrozen(windowId: number): Promise<void> {
		while (this.reloadingWindowIds.has(windowId)) {
			await toPromise(this.onDidReloadingChange.event);
		}
	}
}

export async function serve(
	windowServer: IPCServer,
	handle: string,
	environmentService: IEnvironmentService,
	instantiationService: IInstantiationService
): Promise<IDisposable> {
	const verbose = environmentService.driverVerbose;
	const driver = instantiationService.createInstance(Driver, windowServer, { verbose });

	const windowDriverRegistryChannel = new WindowDriverRegistryChannel(driver);
	windowServer.registerChannel('windowDriverRegistry', windowDriverRegistryChannel);

	const server = await serveNet(handle);
	const channel = new DriverChannel(driver);
	server.registerChannel('driver', channel);

	return combinedDisposable([server, windowServer]);
}
