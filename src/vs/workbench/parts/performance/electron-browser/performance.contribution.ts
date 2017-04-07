/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { assign } from 'vs/base/common/objects';
import { join } from 'path';
import { generateUuid } from 'vs/base/common/uuid';
import { virtualMachineHint } from 'vs/base/node/id';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { writeFile } from 'vs/base/node/pfs';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import product from 'vs/platform/node/product';

class PerformanceContribution implements IWorkbenchContribution {

	constructor(
		@IWindowsService private _windowsService: IWindowsService,
		@ITimerService private _timerService: ITimerService,
		@IMessageService private _messageService: IMessageService,
		@IEnvironmentService private _envService: IEnvironmentService,
		@IStorageService private _storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
	) {

		const dumpFile = _envService.args['prof-startup-timers'];
		if (dumpFile) {
			// wait for extensions being loaded
			extensionService.onReady()
				.then(() => TPromise.timeout(15000)) // time service isn't ready yet because it listens on the same event...
				.then(() => this._dumpTimersAndQuit(dumpFile))
				.done(undefined, err => console.error(err));

		} else if (!_envService.args['prof-startup']) {
			// notify user of slow start
			setTimeout(() => {
				this._checkTimersAndSuggestToProfile();
			}, 5000);
		}
	}

	getId(): string {
		return 'performance';
	}

	private _dumpTimersAndQuit(folder: string) {
		const metrics = this._timerService.startupMetrics;
		const id = generateUuid();
		const all = assign({ id, commit: product.commit }, metrics);
		const raw = JSON.stringify(all);
		return writeFile(join(folder, `timers-${id}.json`), raw).then(() => this._windowsService.quit());
	}

	private _checkTimersAndSuggestToProfile() {

		const disabled = true;
		if (disabled) {
			return;
		}
		//TODO(joh) use better heuristics (70th percentile, not vm, etc)

		const value = this._storageService.get(this.getId(), StorageScope.GLOBAL, undefined);
		if (value !== undefined) {
			return;
		}

		if (virtualMachineHint.value() >= .5) {
			//
			return;
		}

		const { ellapsed } = this._timerService.startupMetrics;
		if (ellapsed > 5000 && Math.ceil(Math.random() * 10) % 3 === 0) {
			const profile = this._messageService.confirm({
				type: 'info',
				message: localize('slow', "Slow startup detected"),
				detail: localize('slow.detail', "Sorry that you just had a slow startup. Please restart '{0}' with profiling enabled, share the profiles with us, and we will work hard to make startup great again.", this._envService.appNameLong),
				primaryButton: 'Restart and profile'
			});

			if (profile) {
				this._storageService.store(this.getId(), 'didProfile', StorageScope.GLOBAL);
				this._windowsService.relaunch({ addArgs: ['--prof-startup'] });
			} else {
				this._storageService.store(this.getId(), 'didReject', StorageScope.GLOBAL);
			}
		}
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(PerformanceContribution);
