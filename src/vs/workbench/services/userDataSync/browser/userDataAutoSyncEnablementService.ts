/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserDataAutoSyncEnablementService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class WebUserDataAutoSyncEnablementService extends UserDataAutoSyncEnablementService {

	private get workbenchEnvironmentService(): IWorkbenchEnvironmentService { return <IWorkbenchEnvironmentService>this.environmentService; }
	private enabled: boolean | undefined = undefined;

	isEnabled(): boolean {
		if (this.enabled === undefined) {
			this.enabled = this.workbenchEnvironmentService.options?.settingsSyncOptions?.enabled;
		}
		if (this.enabled === undefined) {
			this.enabled = super.isEnabled(this.workbenchEnvironmentService.options?.enableSyncByDefault);
		}
		return this.enabled;
	}

	setEnablement(enabled: boolean) {
		if (this.enabled !== enabled) {
			this.enabled = enabled;
			if (this.workbenchEnvironmentService.options?.settingsSyncOptions) {
				if (this.workbenchEnvironmentService.options.settingsSyncOptions?.enablementHandler) {
					this.workbenchEnvironmentService.options.settingsSyncOptions.enablementHandler(this.enabled);
				}
			} else {
				super.setEnablement(enabled);
			}
		}
	}

}
