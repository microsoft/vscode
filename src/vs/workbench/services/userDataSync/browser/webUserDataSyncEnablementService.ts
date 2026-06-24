/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService } from './userDataSyncEnablementService.js';

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
		}
	}

	override getResourceSyncStateVersion(resource: SyncResource): string | undefined {
		return resource === SyncResource.Extensions ? this.workbenchEnvironmentService.options?.settingsSyncOptions?.extensionsSyncStateVersion : undefined;
	}

	private isTrusted(): boolean {
		return !!this.workbenchEnvironmentService.options?.workspaceProvider?.trusted;
	}

}

registerSingleton(IUserDataSyncEnablementService, WebUserDataSyncEnablementService, InstantiationType.Delayed);
