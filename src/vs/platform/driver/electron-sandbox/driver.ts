/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindowDriver } from 'vs/platform/driver/browser/driver';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

interface INativeWindowDriverHelper {
	exitApplication(): Promise<void>;
}

class NativeWindowDriver extends BrowserWindowDriver {

	constructor(
		private readonly helper: INativeWindowDriverHelper,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(fileService, environmentService);
	}

	override exitApplication(): Promise<void> {
		return this.helper.exitApplication();
	}
}

export function registerWindowDriver(instantiationService: IInstantiationService, helper: INativeWindowDriverHelper): void {
	Object.assign(window, { driver: instantiationService.createInstance(NativeWindowDriver, helper) });
}
