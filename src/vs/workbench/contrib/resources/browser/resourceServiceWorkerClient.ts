/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';

class ResourceServiceWorker {

	private static _url = require.toUrl('./resourceServiceWorkerMain.js');

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		navigator.serviceWorker.register(ResourceServiceWorker._url, { scope: '/' }).then(reg => {
			this._logService.trace('SW#reg', reg);
			return reg.update();
		}).then(() => {
			this._logService.info('SW#ready');
		}).catch(err => {
			this._logService.error('SW#init', err);
		});

	}

}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourceServiceWorker,
	LifecyclePhase.Ready
);


