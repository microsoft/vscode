/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUserDataSyncEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncEnablementService } from 'vs/workbench/services/userDataSync/browser/userDataSyncEnablementService';

export class WebUserDataSyncEnablementService extends UserDataSyncEnablementService implements IUserDataSyncEnablementService {

	private enabled: boolean | undefined = undefined;

	override canToggleEnablement(): boolean {
		return this.isTrusted() && super.canToggleEnablement();
	}

	override isEnabled(): boolean {
		if (!this.isTrusted()) {
			return false;
		}
		if (this.enabled === undefined) {
			this.enabled = this.workbenchEnvironmentService.options?.settingsSyncOptions?.enabled;
		}
		if (this.enabled === undefined) {
			this.enabled = super.isEnabled();
		}
		return this.enabled;
	}

	override setEnablement(enabled: boolean) {
		if (enabled && !this.canToggleEnablement()) {
			return;
		}
		if (this.enabled !== enabled) {
			this.enabled = enabled;
			super.setEnablement(enabled);
			if (this.workbenchEnvironmentService.options?.settingsSyncOptions?.enablementHandler) {
				this.workbenchEnvironmentService.options.settingsSyncOptions.enablementHandler(this.enabled);
			}
		}
	}

	override getResourceSyncStateVersion(resource: SyncResource): string | undefined {
		return resource === SyncResource.Extensions ? this.workbenchEnvironmentService.options?.settingsSyncOptions?.extensionsSyncStateVersion : undefined;
	}

	private isTrusted(): boolean {
		return !!this.workbenchEnvironmentService.options?.workspaceProvider?.trusted;
	}

}

registerSingleton(IUserDataSyncEnablementService, WebUserDataSyncEnablementService, false);
