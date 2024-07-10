/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/update/common/update.config.contribution';
import { localize, localize2 } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ProductContribution, UpdateContribution, CONTEXT_UPDATE_STATE, SwitchProductQualityContribution, RELEASE_NOTES_URL, showReleaseNotesInEditor, DOWNLOAD_URL } from 'vs/workbench/contrib/update/browser/update';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import product from 'vs/platform/product/common/product';
import { IUpdateService, StateType } from 'vs/platform/update/common/update';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isWindows } from 'vs/base/common/platform';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { ShowCurrentReleaseNotesActionId, ShowCurrentReleaseNotesFromCurrentFileActionId } from 'vs/workbench/contrib/update/common/update';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

const workbench = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

workbench.registerWorkbenchContribution(ProductContribution, LifecyclePhase.Restored);
workbench.registerWorkbenchContribution(UpdateContribution, LifecyclePhase.Restored);
workbench.registerWorkbenchContribution(SwitchProductQualityContribution, LifecyclePhase.Restored);

// Release notes

export class ShowCurrentReleaseNotesAction extends Action2 {

	constructor() {
		super({
			id: ShowCurrentReleaseNotesActionId,
			title: {
				...localize2('showReleaseNotes', "Show Release Notes"),
				mnemonicTitle: localize({ key: 'mshowReleaseNotes', comment: ['&& denotes a mnemonic'] }, "Show &&Release Notes"),
			},
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
			precondition: RELEASE_NOTES_URL,
			menu: [{
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 5,
				when: RELEASE_NOTES_URL,
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		try {
			await showReleaseNotesInEditor(instantiationService, productService.version, false);
		} catch (err) {
			if (productService.releaseNotesUrl) {
				await openerService.open(URI.parse(productService.releaseNotesUrl));
			} else {
				throw new Error(localize('update.noReleaseNotesOnline', "This version of {0} does not have release notes online", productService.nameLong));
			}
		}
	}
}

export class ShowCurrentReleaseNotesFromCurrentFileAction extends Action2 {

	constructor() {
		super({
			id: ShowCurrentReleaseNotesFromCurrentFileActionId,
			title: {
				...localize2('showReleaseNotesCurrentFile', "Open Current File as Release Notes"),
				mnemonicTitle: localize({ key: 'mshowReleaseNotes', comment: ['&& denotes a mnemonic'] }, "Show &&Release Notes"),
			},
			category: localize2('developerCategory', "Developer"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const productService = accessor.get(IProductService);

		try {
			await showReleaseNotesInEditor(instantiationService, productService.version, true);
		} catch (err) {
			throw new Error(localize('releaseNotesFromFileNone', "Cannot open the current file as Release Notes"));
		}
	}
}

registerAction2(ShowCurrentReleaseNotesAction);
registerAction2(ShowCurrentReleaseNotesFromCurrentFileAction);

// Update

export class CheckForUpdateAction extends Action2 {

	constructor() {
		super({
			id: 'update.checkForUpdate',
			title: localize2('checkForUpdates', 'Check for Updates...'),
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
			precondition: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const updateService = accessor.get(IUpdateService);
		return updateService.checkForUpdates(true);
	}
}

class DownloadUpdateAction extends Action2 {
	constructor() {
		super({
			id: 'update.downloadUpdate',
			title: localize2('downloadUpdate', 'Download Update'),
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
			title: localize2('installUpdate', 'Install Update'),
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
			title: localize2('restartToUpdate', 'Restart to Update'),
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
			precondition: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IUpdateService).quitAndInstall();
	}
}

class DownloadAction extends Action2 {

	static readonly ID = 'workbench.action.download';

	constructor() {
		super({
			id: DownloadAction.ID,
			title: localize2('openDownloadPage', "Download {0}", product.nameLong),
			precondition: ContextKeyExpr.and(IsWebContext, DOWNLOAD_URL), // Only show when running in a web browser and a download url is available
			f1: true,
			menu: [{
				id: MenuId.StatusBarWindowIndicatorMenu,
				when: ContextKeyExpr.and(IsWebContext, DOWNLOAD_URL)
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const productService = accessor.get(IProductService);
		const openerService = accessor.get(IOpenerService);

		if (productService.downloadUrl) {
			openerService.open(URI.parse(productService.downloadUrl));
		}
	}
}

registerAction2(DownloadAction);
registerAction2(CheckForUpdateAction);
registerAction2(DownloadUpdateAction);
registerAction2(InstallUpdateAction);
registerAction2(RestartToUpdateAction);

if (isWindows) {
	class DeveloperApplyUpdateAction extends Action2 {
		constructor() {
			super({
				id: '_update.applyupdate',
				title: localize2('applyUpdate', 'Apply Update...'),
				category: Categories.Developer,
				f1: true,
				precondition: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle)
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const updateService = accessor.get(IUpdateService);
			const fileDialogService = accessor.get(IFileDialogService);

			const updatePath = await fileDialogService.showOpenDialog({
				title: localize('pickUpdate', "Apply Update"),
				filters: [{ name: 'Setup', extensions: ['exe'] }],
				canSelectFiles: true,
				openLabel: mnemonicButtonLabel(localize({ key: 'updateButton', comment: ['&& denotes a mnemonic'] }, "&&Update"))
			});

			if (!updatePath || !updatePath[0]) {
				return;
			}

			await updateService._applySpecificUpdate(updatePath[0].fsPath);
		}
	}

	registerAction2(DeveloperApplyUpdateAction);
}
