/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { writeFile } from 'vs/base/node/pfs';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';

class PerformanceContribution implements IWorkbenchContribution {

	constructor(
		@IWindowsService private _windowsService: IWindowsService,
		@ITimerService private _timerService: ITimerService,
		@IEnvironmentService envService: IEnvironmentService,
		@IExtensionService extensionService: IExtensionService
	) {

		const dumpFile = envService.args['prof-startup-timers'];
		if (dumpFile) {
			// wait for extensions being loaded
			extensionService.onReady()
				.then(() => TPromise.timeout(100)) // time service isn't ready yet because it listens on the same event...
				.then(() => this._dumpTimersAndQuit(dumpFile))
				.done(undefined, err => console.error(err));
		}
	}

	getId(): string {
		return 'performance';
	}

	private _dumpTimersAndQuit(path: string) {
		const metrics = this._timerService.startupMetrics;
		const raw = JSON.stringify(metrics);
		return writeFile(path, raw).then(() => this._windowsService.quit());
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(PerformanceContribution);
