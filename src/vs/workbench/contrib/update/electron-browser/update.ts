/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import severity from 'vs/base/common/severity';
import product from 'vs/platform/product/common/product';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class Win3264BitContribution implements IWorkbenchContribution {

	private static readonly URL = 'https://code.visualstudio.com/updates/v1_15#_windows-64-bit';
	private static readonly INSIDER_URL = 'https://github.com/Microsoft/vscode-docs/blob/vnext/release-notes/v1_15.md#windows-64-bit';

	constructor(
		@INotificationService notificationService: INotificationService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		if (environmentService.disableUpdates) {
			return;
		}

		const url = product.quality === 'insider'
			? Win3264BitContribution.INSIDER_URL
			: Win3264BitContribution.URL;

		notificationService.prompt(
			severity.Info,
			nls.localize('64bitisavailable', "{0} for 64-bit Windows is now available! Click [here]({1}) to learn more.", product.nameShort, url),
			[],
			{
				sticky: true,
				neverShowAgain: { id: 'neverShowAgain:update/win32-64bits', isSecondary: true }
			}
		);
	}
}
