/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IWelcomeModalDialogService } from 'vs/workbench/contrib/welcomeModalDialog/browser/welcomeModalDialogService';

class WelcomeModalContribution {

	private static readonly WELCOME_MODAL_DIALOG_DISMISSED_KEY = 'workbench.modal.dialog.welcome.dismissed';

	constructor(
		@IWelcomeModalDialogService welcomeModalDialogService: IWelcomeModalDialogService,
		@IStorageService storageService: IStorageService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService
	) {
		const welcomeModalDialog = environmentService.options?.welcomeModalDialog;
		if (!welcomeModalDialog) {
			return;
		}

		if (storageService.getBoolean(WelcomeModalContribution.WELCOME_MODAL_DIALOG_DISMISSED_KEY + '#' + welcomeModalDialog.routeId, StorageScope.PROFILE, false)) {
			return;
		}

		welcomeModalDialogService.show({
			title: welcomeModalDialog.title,
			buttonText: welcomeModalDialog.buttonText,
			messages: welcomeModalDialog.messages,
			action: welcomeModalDialog.action,
			onClose: () => {
				storageService.store(WelcomeModalContribution.WELCOME_MODAL_DIALOG_DISMISSED_KEY + '#' + welcomeModalDialog.routeId, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeModalContribution, LifecyclePhase.Restored);
