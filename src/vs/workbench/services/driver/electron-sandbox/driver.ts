/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window';
import { IEnvironmentService } from '../../../../platform/environment/common/environment';
import { IFileService } from '../../../../platform/files/common/files';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { ILogService } from '../../../../platform/log/common/log';
import { BrowserWindowDriver } from '../browser/driver';
import { ILifecycleService } from '../../lifecycle/common/lifecycle';

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
