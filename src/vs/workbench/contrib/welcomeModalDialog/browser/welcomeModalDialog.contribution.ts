/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { ThemeIcon } from 'vs/base/common/themables';
import { IModalDialogService } from 'vs/workbench/services/modalDialog/browser/modalDialogService';

class WelcomeModalContribution {

	private static readonly WELCOME_MODAL_DIALOG_DISMISSED_KEY = 'workbench.modal.dialog.welcome.dismissed';

	constructor(
		@IModalDialogService modalDialogService: IModalDialogService,
		@IStorageService storageService: IStorageService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService
	) {
		const modalDialog = environmentService.options?.welcomeModalDialog;
		if (!modalDialog) {
			return;
		}

		if (storageService.getBoolean(WelcomeModalContribution.WELCOME_MODAL_DIALOG_DISMISSED_KEY + '#' + modalDialog.routeId, StorageScope.PROFILE, false)) {
			return;
		}

		modalDialogService.show({
			title: modalDialog.title,
			buttonText: modalDialog.buttonText,
			mainMessage: { message: modalDialog.mainMessage.message, icon: ThemeIcon.fromId(modalDialog.mainMessage.icon) },
			secondaryMessage: { message: modalDialog.secondaryMessage.message, icon: ThemeIcon.fromId(modalDialog.secondaryMessage.icon) },
			action: modalDialog.action,
			onClose: () => {
				storageService.store(WelcomeModalContribution.WELCOME_MODAL_DIALOG_DISMISSED_KEY + '#' + modalDialog.routeId, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeModalContribution, LifecyclePhase.Restored);
