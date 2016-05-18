/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { ShowReleaseNotesAction } from 'vs/workbench/electron-browser/update';
import { Action } from 'vs/base/common/actions';
import { shell } from 'electron';
import * as semver from 'semver';

const CloseAction = new Action('close', nls.localize('close', "Close"), '', true, () => null);

const ShowLicenseAction = (licenseUrl: string) => new Action(
	'update.showLicense',
	nls.localize('license', "Read License"),
	null,
	true,
	() => { shell.openExternal(licenseUrl); return TPromise.as(null); }
);

export class UpdateContribution implements IWorkbenchContribution {

	private static KEY = 'releaseNotes/lastVersion';
	getId() { return 'vs.update'; }

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IMessageService messageService: IMessageService
	) {
		const env = contextService.getConfiguration().env;
		const lastVersion = storageService.get(UpdateContribution.KEY, StorageScope.GLOBAL, '');

		// was there an update?
		if (env.releaseNotesUrl && lastVersion && env.version !== lastVersion) {
			setTimeout(() => {
				messageService.show(Severity.Info, {
					message: nls.localize('releaseNotes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", env.appName, env.version),
					actions: [
						CloseAction,
						ShowReleaseNotesAction(env.releaseNotesUrl, true)
					]
				});

			}, 0);
		}

		// should we show the new license?
		if (env.licenseUrl && lastVersion && semver.satisfies(lastVersion, '<1.0.0') && semver.satisfies(env.version, '>=1.0.0')) {
			setTimeout(() => {
				messageService.show(Severity.Info, {
					message: nls.localize('licenseChanged', "Our license terms have changed, please go through them.", env.appName, env.version),
					actions: [
						CloseAction,
						ShowLicenseAction(env.licenseUrl)
					]
				});

			}, 0);
		}

		storageService.store(UpdateContribution.KEY, env.version, StorageScope.GLOBAL);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(UpdateContribution);