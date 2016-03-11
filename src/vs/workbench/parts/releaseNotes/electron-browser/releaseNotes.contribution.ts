/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { ShowReleaseNotesAction } from 'vs/workbench/electron-browser/update';
import { Action } from 'vs/base/common/actions';

export class ReleaseNotesContribution implements IWorkbenchContribution {

	private static KEY = 'releaseNotes/lastVersion';

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IMessageService messageService: IMessageService
	) {
		const env = contextService.getConfiguration().env;

		if (!env.releaseNotesUrl) {
			return;
		}

		const lastVersion = storageService.get(ReleaseNotesContribution.KEY, StorageScope.GLOBAL, '');

		// was there an update?
		if (lastVersion && env.version !== lastVersion) {
			setTimeout(() => {
				messageService.show(Severity.Info, {
					message: nls.localize('releaseNotes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", env.appName, env.version),
					actions: [
						new Action('close', nls.localize('close', "Close"), '', true, () => null),
						ShowReleaseNotesAction(env.releaseNotesUrl, true)
					]
				});

			}, 0);
		}

		storageService.store(ReleaseNotesContribution.KEY, env.version, StorageScope.GLOBAL);
	}

	getId() {
		return 'vs.releaseNotes';
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ReleaseNotesContribution);