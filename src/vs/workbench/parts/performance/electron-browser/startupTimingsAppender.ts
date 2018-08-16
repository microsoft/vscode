/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITimerService } from 'vs/workbench/services/timer/electron-browser/timerService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { nfcall } from 'vs/base/common/async';
import { appendFile } from 'fs';
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
			return;
		}

		Promise.all([
			lifecycleService.when(LifecyclePhase.Eventually),
			timerService.startupMetrics
		]).then(([, startupMetrics]) => {

			return nfcall(appendFile, appendTo, `${product.nameShort}\t${product.commit || '0000000'}\t${Date.now()}\t${startupMetrics.ellapsed}\n`);
		}).then(() => {
			windowsService.quit();
		}).catch(err => {
			console.error(err);
			windowsService.quit();
		});
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(StartupTimingsAppender, LifecyclePhase.Running);
