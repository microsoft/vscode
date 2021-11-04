/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { BrowserWindowDriver } from 'vs/workbench/contrib/driver/browser/driver';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';

class ElectronWindowDriver extends BrowserWindowDriver {

	constructor(
		@IHostService hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService
	) {
		super(hostService);
	}

	override async getWindowIds(): Promise<number[]> {
		return [this.environmentService.configuration.windowId];
	}

	override reloadWindow(): Promise<void> {
		return this.nativeHostService.reload();
	}

	override exitApplication(): Promise<void> {
		return this.nativeHostService.quit();
	}
}

export class DriverContribution implements IWorkbenchContribution {

	constructor(
		@IHostService hostService: IHostService,
		@INativeHostService nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService
	) {
		if (environmentService.enableDriver) {
			(<any>window).driver = new ElectronWindowDriver(hostService, nativeHostService, environmentService);
		}
	}
}
