/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { UserDataSyncWorkbenchContribution } from 'vs/workbench/contrib/userDataSync/browser/userDataSync';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';

class UserDataSyncSettingsMigrationContribution implements IWorkbenchContribution {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
	) {
		if (!configurationService.getValue('sync.enableSettings')) {
			userDataSyncEnablementService.setResourceEnablement('settings', false);
		}
		if (!configurationService.getValue('sync.enableKeybindings')) {
			userDataSyncEnablementService.setResourceEnablement('keybindings', false);
		}
		if (!configurationService.getValue('sync.enableUIState')) {
			userDataSyncEnablementService.setResourceEnablement('globalState', false);
		}
		if (!configurationService.getValue('sync.enableExtensions')) {
			userDataSyncEnablementService.setResourceEnablement('extensions', false);
		}
		if (configurationService.getValue('sync.enable')) {
			userDataSyncEnablementService.setEnablement(true);
		}
		this.removeFromConfiguration();
	}

	private async removeFromConfiguration(): Promise<void> {
		await this.configurationService.updateValue('sync.enable', undefined, ConfigurationTarget.USER);
		await this.configurationService.updateValue('sync.enableSettings', undefined, ConfigurationTarget.USER);
		await this.configurationService.updateValue('sync.enableKeybindings', undefined, ConfigurationTarget.USER);
		await this.configurationService.updateValue('sync.enableUIState', undefined, ConfigurationTarget.USER);
		await this.configurationService.updateValue('sync.enableExtensions', undefined, ConfigurationTarget.USER);
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncWorkbenchContribution, LifecyclePhase.Ready);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncSettingsMigrationContribution, LifecyclePhase.Ready);
