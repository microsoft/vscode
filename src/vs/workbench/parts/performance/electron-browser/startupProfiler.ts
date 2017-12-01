/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ReportPerformanceIssueAction } from 'vs/workbench/electron-browser/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { join, dirname } from 'path';
import { localize } from 'vs/nls';
import { readdir, del, readFile } from 'vs/base/node/pfs';
import { basename } from 'vs/base/common/paths';

class StartupProfiler implements IWorkbenchContribution {

	constructor(
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IMessageService private readonly _messageService: IMessageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IExtensionService extensionService: IExtensionService,
	) {
		// wait for everything to be ready
		Promise.all([
			lifecycleService.when(LifecyclePhase.Eventually),
			extensionService.whenInstalledExtensionsRegistered()
		]).then(() => {
			this._stopProfiling();
		});
	}

	private _stopProfiling(): void {

		const profileFilenamePrefix = this._environmentService.args['prof-startup-prefix'];
		if (!profileFilenamePrefix) {
			return;
		}

		const dir = dirname(profileFilenamePrefix);
		const prefix = basename(profileFilenamePrefix);

		const removeArgs: string[] = ['--prof-startup'];
		const markerFile = readFile(profileFilenamePrefix).then(value => removeArgs.push(...value.toString().split('|')))
			.then(() => del(profileFilenamePrefix))
			.then(() => TPromise.timeout(1000));

		markerFile.then(() => {
			return readdir(dir).then(files => files.filter(value => value.indexOf(prefix) === 0));
		}).then(files => {
			const profileFiles = files.reduce((prev, cur) => `${prev}${join(dir, cur)}\n`, '\n');

			const primaryButton = this._messageService.confirmSync({
				type: 'info',
				message: localize('prof.message', "Successfully created profiles."),
				detail: localize('prof.detail', "Please create an issue and manually attach the following files:\n{0}", profileFiles),
				primaryButton: localize('prof.restartAndFileIssue', "Create Issue and Restart"),
				secondaryButton: localize('prof.restart', "Restart")
			});

			if (primaryButton) {
				const action = this._instantiationService.createInstance(ReportPerformanceIssueAction, ReportPerformanceIssueAction.ID, ReportPerformanceIssueAction.LABEL);
				TPromise.join<any>([
					this._windowsService.showItemInFolder(join(dir, files[0])),
					action.run(`:warning: Make sure to **attach** these files from your *home*-directory: :warning:\n${files.map(file => `-\`${file}\``).join('\n')}`)
				]).then(() => {
					// keep window stable until restart is selected
					this._messageService.confirmSync({
						type: 'info',
						message: localize('prof.thanks', "Thanks for helping us."),
						detail: localize('prof.detail.restart', "A final restart is required to continue to use '{0}'. Again, thank you for your contribution.", this._environmentService.appNameLong),
						primaryButton: localize('prof.restart', "Restart"),
						secondaryButton: null
					});
					// now we are ready to restart
					this._windowsService.relaunch({ removeArgs });
				});

			} else {
				// simply restart
				this._windowsService.relaunch({ removeArgs });
			}
		});
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(StartupProfiler, LifecyclePhase.Running);
