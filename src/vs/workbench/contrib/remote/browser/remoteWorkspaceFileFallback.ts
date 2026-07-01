/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';

export class RemoteWorkspaceFileFallbackNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.remoteWorkspaceFileFallbackNotifier';

	constructor(
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		if (this.environmentService.remoteAuthority && this.environmentService.options?.workspaceFileFallback) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('workspaceFileFallback', "The specified workspace file was not found. Opened the workspace folder instead. The workspace file may still be generating \u2014 try reloading once setup completes."),
				sticky: true,
			});
		}
	}
}
