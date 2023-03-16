/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IWelcomeDialogService as IWelcomeDialogService } from 'vs/workbench/contrib/welcomeDialog/browser/welcomeDialogService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const configurationKey = 'welcome.experimental.dialog';

class WelcomeDialogContribution {

	private static readonly WELCOME_DIALOG_DISMISSED_KEY = 'workbench.dialog.welcome.dismissed';

	constructor(
		@IWelcomeDialogService welcomeDialogService: IWelcomeDialogService,
		@IStorageService storageService: IStorageService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const setting = configurationService.inspect<boolean>(configurationKey);
		if (!setting.value) {
			return;
		}

		const welcomeDialog = environmentService.options?.welcomeDialog;
		if (!welcomeDialog) {
			return;
		}

		if (storageService.getBoolean(WelcomeDialogContribution.WELCOME_DIALOG_DISMISSED_KEY + '#' + welcomeDialog.id, StorageScope.PROFILE, false)) {
			return;
		}

		welcomeDialogService.show({
			title: welcomeDialog.title,
			buttonText: welcomeDialog.buttonText,
			messages: welcomeDialog.messages,
			action: welcomeDialog.action,
			onClose: () => {
				storageService.store(WelcomeDialogContribution.WELCOME_DIALOG_DISMISSED_KEY + '#' + welcomeDialog.id, true, StorageScope.PROFILE, StorageTarget.USER);
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeDialogContribution, LifecyclePhase.Restored);
