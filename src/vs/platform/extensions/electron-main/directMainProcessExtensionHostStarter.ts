/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionHostStarter, IPartialLogService } from 'vs/platform/extensions/node/extensionHostStarter';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';

export class DirectMainProcessExtensionHostStarter extends ExtensionHostStarter {

	constructor(
		@ILogService logService: IPartialLogService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService
	) {
		super(logService);

		// On shutdown: gracefully await extension host shutdowns
		lifecycleMainService.onWillShutdown((e) => {
			e.join(this.waitForAllExit(6000));
		});
	}

}
