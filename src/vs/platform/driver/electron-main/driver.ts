/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeybindingParser } from 'vs/base/common/keybindingParser';
import { KeyCode } from 'vs/base/common/keyCodes';
import { SimpleKeybinding, ScanCodeBinding } from 'vs/base/common/keybindings';
import { combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import { IPCServer, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { serve as serveNet } from 'vs/base/parts/ipc/node/ipc.net';
import { IDriver, IElement, ILocaleInfo, ILocalizedStrings, IWindowDriver, IWindowDriverRegistry } from 'vs/platform/driver/common/driver';
import { WindowDriverChannelClient } from 'vs/platform/driver/common/driverIpc';
import { DriverChannel, WindowDriverRegistryChannel } from 'vs/platform/driver/node/driver';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/path';
import { VSBuffer } from 'vs/base/common/buffer';
import { ILogService } from 'vs/platform/log/common/log';

function isSilentKeyCode(keyCode: KeyCode) {
	return keyCode < KeyCode.Digit0;
}

export class Driver implements IDriver, IWindowDriverRegistry {

	declare readonly _serviceBrand: undefined;

	private registeredWindowIds = new Set<number>();
	private reloadingWindowIds = new Set<number>();
	private readonly onDidReloadingChange = new Emitter<void>();

	constructor(
		private windowServer: IPCServer,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService
	) { }

	async registerWindowDriver(windowId: number): Promise<void> {
		this.logService.info(`[driver] registerWindowDriver(${windowId})`);

		this.registeredWindowIds.add(windowId);
		this.reloadingWindowIds.delete(windowId);
		this.onDidReloadingChange.fire();
	}

	async reloadWindowDriver(windowId: number): Promise<void> {
		this.logService.info(`[driver] reloadWindowDriver(${windowId})`);

		this.reloadingWindowIds.add(windowId);
	}

	async getWindowIds(): Promise<number[]> {
		const windowIds = this.windowsMainService.getWindows()
			.map(window => window.id)
			.filter(windowId => this.registeredWindowIds.has(windowId) && !this.reloadingWindowIds.has(windowId));

		return windowIds;
	}

	async capturePage(windowId: number): Promise<string> {
		const window = this.windowsMainService.getWindowById(windowId) ?? this.windowsMainService.getLastActiveWindow(); // fallback to active window to ensure we capture window
		if (!window?.win) {
			throw new Error('Invalid window');
		}

		const webContents = window.win.webContents;
		const image = await webContents.capturePage();
		return image.toPNG().toString('base64');
	}

	async startTracing(windowId: number, name: string): Promise<void> {
		// ignore - tracing is not implemented yet
	}

	async stopTracing(windowId: number, name: string, persist: boolean): Promise<void> {
		if (!persist) {
			return;
		}

		const raw = await this.capturePage(windowId);
		const buffer = Buffer.from(raw, 'base64');

		await this.fileService.writeFile(URI.file(join(this.environmentMainService.logsPath, `${name}.png`)), VSBuffer.wrap(buffer));
	}

	async reloadWindow(windowId: number): Promise<void> {
		this.logService.info(`[driver] reloadWindow(${windowId})`);

		await this.whenUnfrozen(windowId);

		const window = this.windowsMainService.getWindowById(windowId);
		if (!window) {
			throw new Error('Invalid window');
		}

		this.reloadingWindowIds.add(windowId);
		this.lifecycleMainService.reload(window);
	}

	async exitApplication(): Promise<number> {
		this.logService.info(`[driver] exitApplication()`);

		this.lifecycleMainService.quit();

		return process.pid;
	}

	async dispatchKeybinding(windowId: number, keybinding: string): Promise<void> {
		await this.whenUnfrozen(windowId);

		const parts = KeybindingParser.parseUserBinding(keybinding);

		for (let part of parts) {
			await this._dispatchKeybinding(windowId, part);
		}
	}

	private async _dispatchKeybinding(windowId: number, keybinding: SimpleKeybinding | ScanCodeBinding): Promise<void> {
		if (keybinding instanceof ScanCodeBinding) {
			throw new Error('ScanCodeBindings not supported');
		}

		const window = this.windowsMainService.getWindowById(windowId);
		if (!window?.win) {
			throw new Error('Invalid window');
		}
		const webContents = window.win.webContents;
		const noModifiedKeybinding = new SimpleKeybinding(false, false, false, false, keybinding.keyCode);
		const resolvedKeybinding = new USLayoutResolvedKeybinding(noModifiedKeybinding.toChord(), OS);
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

		await timeout(100);
	}

	async click(windowId: number, selector: string, xoffset?: number, yoffset?: number): Promise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		await windowDriver.click(selector, xoffset, yoffset);
	}

	async setValue(windowId: number, selector: string, text: string): Promise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		await windowDriver.setValue(selector, text);
	}

	async getTitle(windowId: number): Promise<string> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.getTitle();
	}

	async isActiveElement(windowId: number, selector: string): Promise<boolean> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.isActiveElement(selector);
	}

	async getElements(windowId: number, selector: string, recursive: boolean): Promise<IElement[]> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.getElements(selector, recursive);
	}

	async getElementXY(windowId: number, selector: string, xoffset?: number, yoffset?: number): Promise<{ x: number; y: number }> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.getElementXY(selector, xoffset, yoffset);
	}

	async typeInEditor(windowId: number, selector: string, text: string): Promise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		await windowDriver.typeInEditor(selector, text);
	}

	async getTerminalBuffer(windowId: number, selector: string): Promise<string[]> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.getTerminalBuffer(selector);
	}

	async writeInTerminal(windowId: number, selector: string, text: string): Promise<void> {
		const windowDriver = await this.getWindowDriver(windowId);
		await windowDriver.writeInTerminal(selector, text);
	}

	async getLocaleInfo(windowId: number): Promise<ILocaleInfo> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.getLocaleInfo();
	}

	async getLocalizedStrings(windowId: number): Promise<ILocalizedStrings> {
		const windowDriver = await this.getWindowDriver(windowId);
		return await windowDriver.getLocalizedStrings();
	}

	private async getWindowDriver(windowId: number): Promise<IWindowDriver> {
		await this.whenUnfrozen(windowId);

		const id = `window:${windowId}`;
		const router = new StaticRouter(ctx => ctx === id);
		const windowDriverChannel = this.windowServer.getChannel('windowDriver', router);
		return new WindowDriverChannelClient(windowDriverChannel);
	}

	private async whenUnfrozen(windowId: number): Promise<void> {
		while (this.reloadingWindowIds.has(windowId)) {
			await Event.toPromise(this.onDidReloadingChange.event);
		}
	}
}

export async function serve(
	windowServer: IPCServer,
	handle: string,
	instantiationService: IInstantiationService
): Promise<IDisposable> {
	const driver = instantiationService.createInstance(Driver, windowServer);

	const windowDriverRegistryChannel = new WindowDriverRegistryChannel(driver);
	windowServer.registerChannel('windowDriverRegistry', windowDriverRegistryChannel);

	const server = await serveNet(handle);
	const channel = new DriverChannel(driver);
	server.registerChannel('driver', channel);

	return combinedDisposable(server, windowServer);
}
