/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { BrowserWindowDriver } from 'vs/platform/driver/browser/driver';
import { WindowDriverChannel, WindowDriverRegistryChannelClient } from 'vs/platform/driver/common/driverIpc';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

interface INativeWindowDriverHelper {
	exitApplication(): Promise<number /* main process PID */>;
}

class NativeWindowDriver extends BrowserWindowDriver {

	constructor(private readonly helper: INativeWindowDriverHelper) {
		super();
	}

	exitApplication(): Promise<number> {
		return this.helper.exitApplication();
	}
}

export function registerWindowDriver(helper: INativeWindowDriverHelper): void {
	Object.assign(window, { driver: new NativeWindowDriver(helper) });
}

class LegacyNativeWindowDriver extends BrowserWindowDriver {

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super();
	}

	override click(selector: string, xoffset?: number, yoffset?: number): Promise<void> {
		const offset = typeof xoffset === 'number' && typeof yoffset === 'number' ? { x: xoffset, y: yoffset } : undefined;

		return this.doClick(selector, 1, offset);
	}

	private async doClick(selector: string, clickCount: number, offset?: { x: number; y: number }): Promise<void> {
		const { x, y } = await this._getElementXY(selector, offset);

		await this.nativeHostService.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount } as any);
		await timeout(10);

		await this.nativeHostService.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount } as any);
		await timeout(100);
	}
}

/**
 * Old school window driver that is implemented by us
 * from the main process.
 *
 * @deprecated
 */
export async function registerLegacyWindowDriver(accessor: ServicesAccessor, windowId: number): Promise<IDisposable> {
	const instantiationService = accessor.get(IInstantiationService);
	const mainProcessService = accessor.get(IMainProcessService);

	const windowDriver = instantiationService.createInstance(LegacyNativeWindowDriver);
	const windowDriverChannel = new WindowDriverChannel(windowDriver);
	mainProcessService.registerChannel('windowDriver', windowDriverChannel);

	const windowDriverRegistryChannel = mainProcessService.getChannel('windowDriverRegistry');
	const windowDriverRegistry = new WindowDriverRegistryChannelClient(windowDriverRegistryChannel);

	await windowDriverRegistry.registerWindowDriver(windowId);

	return toDisposable(() => windowDriverRegistry.reloadWindowDriver(windowId));
}
