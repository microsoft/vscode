/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITimerService, didUseCachedData } from 'vs/workbench/services/timer/electron-browser/timerService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { nfcall, timeout } from 'vs/base/common/async';
import { appendFile, } from 'fs';
import product from 'vs/platform/node/product';

class StartupTimingsAppender implements IWorkbenchContribution {

	constructor(
		@ITimerService timerService: ITimerService,
		@IWindowsService windowsService: IWindowsService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEnvironmentService environmentService: IEnvironmentService,
	) {

		let appendTo = environmentService.args['prof-append-timers'];
		if (!appendTo) {
			// nothing to do
			return;
		}

		Promise.all([
			timerService.startupMetrics,
			this._waitWhenNoCachedData(),
		]).then(([startupMetrics]) => {
			return nfcall(appendFile, appendTo, `${startupMetrics.ellapsed}\t${product.nameLong}\t${product.commit || '0000000'}\n`);
		}).then(() => {
			windowsService.quit();
		}).catch(err => {
			console.error(err);
			windowsService.quit();
		});
	}

	private _waitWhenNoCachedData(): Promise<void> {
		// wait 15s for cached data to be produced
		return !didUseCachedData()
			? timeout(15000)
			: Promise.resolve();
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(StartupTimingsAppender, LifecyclePhase.Eventually);
