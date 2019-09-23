/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class DesktopHostService implements IHostService {

	_serviceBrand: undefined;

	constructor(@IElectronService private readonly electronService: IElectronService) { }

	//#region Window

	get windowCount() { return this.electronService.windowCount(); }

	openEmptyWindow(options?: { reuse?: boolean, remoteAuthority?: string }): Promise<void> {
		return this.electronService.openEmptyWindow(options);
	}

	toggleFullScreen(): Promise<void> {
		return this.electronService.toggleFullScreen();
	}

	//#endregion

	restart(): Promise<void> {
		return this.electronService.relaunch();
	}

	reload(): Promise<void> {
		return this.electronService.reload();
	}
}

registerSingleton(IHostService, DesktopHostService, true);
