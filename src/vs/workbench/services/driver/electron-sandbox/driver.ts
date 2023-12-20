/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from 'vs/base/browser/window';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { BrowserWindowDriver } from 'vs/workbench/services/driver/browser/driver';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

interface INativeWindowDriverHelper {
	exitApplication(): Promise<void>;
}

class NativeWindowDriver extends BrowserWindowDriver {

	constructor(
		private readonly helper: INativeWindowDriverHelper,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService logService: ILogService
	) {
		super(fileService, environmentService, lifecycleService, logService);
	}

	override exitApplication(): Promise<void> {
		return this.helper.exitApplication();
	}
}

export function registerWindowDriver(instantiationService: IInstantiationService, helper: INativeWindowDriverHelper): void {
	Object.assign(mainWindow, { driver: instantiationService.createInstance(NativeWindowDriver, helper) });
}
