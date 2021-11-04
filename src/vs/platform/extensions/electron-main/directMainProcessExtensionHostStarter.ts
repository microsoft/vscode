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

		lifecycleMainService.onWillShutdown((e) => {
			const exitPromises: Promise<void>[] = [];
			for (const [, extHost] of this._extHosts) {
				exitPromises.push(extHost.waitForExit(6000));
			}
			e.join(Promise.all(exitPromises).then(() => { }));
		});
	}

}
