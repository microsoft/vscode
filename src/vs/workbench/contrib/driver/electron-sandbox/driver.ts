/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { BrowserWindowDriver } from 'vs/workbench/contrib/driver/browser/driver';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

class ElectronWindowDriver extends BrowserWindowDriver {

	constructor(
		@IHostService hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super(hostService, lifecycleService);
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
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		if (environmentService.enableDriver) {
			(<any>window).driver = instantiationService.createInstance(ElectronWindowDriver);
		}
	}
}
