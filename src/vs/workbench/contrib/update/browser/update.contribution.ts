/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/update/common/update.config.contribution';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor, MenuRegistry, MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ShowCurrentReleaseNotesAction, ProductContribution, UpdateContribution, CheckForVSCodeUpdateAction, CONTEXT_UPDATE_STATE, SwitchProductQualityContribution } from 'vs/workbench/contrib/update/browser/update';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import product from 'vs/platform/product/common/product';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

const workbench = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

workbench.registerWorkbenchContribution(ProductContribution, LifecyclePhase.Restored);
workbench.registerWorkbenchContribution(UpdateContribution, LifecyclePhase.Restored);
workbench.registerWorkbenchContribution(SwitchProductQualityContribution, LifecyclePhase.Restored);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

// Editor
actionRegistry
	.registerWorkbenchAction(SyncActionDescriptor.from(ShowCurrentReleaseNotesAction), `${product.nameShort}: Show Release Notes`, product.nameShort);

actionRegistry
	.registerWorkbenchAction(SyncActionDescriptor.from(CheckForVSCodeUpdateAction), `${product.nameShort}: Check for Update`, product.nameShort, CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle));

class DownloadUpdateAction extends Action2 {
	constructor() {
		super({
			id: 'update.downloadUpdate',
			title: { value: localize('downloadUpdate', "Download Update"), original: 'Download Update' },
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
			precondition: CONTEXT_UPDATE_STATE.isEqualTo(StateType.AvailableForDownload)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IUpdateService).downloadUpdate();
	}
}

class InstallUpdateAction extends Action2 {
	constructor() {
		super({
			id: 'update.installUpdate',
			title: { value: localize('installUpdate', "Install Update"), original: 'Install Update' },
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
			precondition: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloaded)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IUpdateService).applyUpdate();
	}
}

class RestartToUpdateAction extends Action2 {
	constructor() {
		super({
			id: 'update.restartToUpdate',
			title: { value: localize('restartToUpdate', "Restart to Update"), original: 'Restart to Update' },
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
			precondition: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IUpdateService).quitAndInstall();
	}
}

registerAction2(DownloadUpdateAction);
registerAction2(InstallUpdateAction);
registerAction2(RestartToUpdateAction);

// Menu
if (ShowCurrentReleaseNotesAction.AVAILABE) {
	MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
		group: '1_welcome',
		command: {
			id: ShowCurrentReleaseNotesAction.ID,
			title: localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes")
		},
		order: 5
	});
}
