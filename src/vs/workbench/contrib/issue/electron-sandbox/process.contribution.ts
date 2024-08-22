/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls';
import { MenuRegistry, MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions';
import { IWorkbenchProcessService } from '../common/issue';
import { CommandsRegistry } from '../../../../platform/commands/common/commands';
import { Categories } from '../../../../platform/action/common/actionCommonCategories';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { INativeHostService } from '../../../../platform/native/common/native';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress';
import { IProcessMainService } from '../../../../platform/issue/common/issue';
import './processService';
import './issueMainService';


//#region Commands

class OpenProcessExplorer extends Action2 {

	static readonly ID = 'workbench.action.openProcessExplorer';

	constructor() {
		super({
			id: OpenProcessExplorer.ID,
			title: localize2('openProcessExplorer', 'Open Process Explorer'),
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const processService = accessor.get(IWorkbenchProcessService);

		return processService.openProcessExplorer();
	}
}
registerAction2(OpenProcessExplorer);
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: OpenProcessExplorer.ID,
		title: localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")
	},
	order: 2
});

class StopTracing extends Action2 {

	static readonly ID = 'workbench.action.stopTracing';

	constructor() {
		super({
			id: StopTracing.ID,
			title: localize2('stopTracing', 'Stop Tracing'),
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const processService = accessor.get(IProcessMainService);
		const environmentService = accessor.get(INativeEnvironmentService);
		const dialogService = accessor.get(IDialogService);
		const nativeHostService = accessor.get(INativeHostService);
		const progressService = accessor.get(IProgressService);

		if (!environmentService.args.trace) {
			const { confirmed } = await dialogService.confirm({
				message: localize('stopTracing.message', "Tracing requires to launch with a '--trace' argument"),
				primaryButton: localize({ key: 'stopTracing.button', comment: ['&& denotes a mnemonic'] }, "&&Relaunch and Enable Tracing"),
			});

			if (confirmed) {
				return nativeHostService.relaunch({ addArgs: ['--trace'] });
			}
		}

		await progressService.withProgress({
			location: ProgressLocation.Dialog,
			title: localize('stopTracing.title', "Creating trace file..."),
			cancellable: false,
			detail: localize('stopTracing.detail', "This can take up to one minute to complete.")
		}, () => processService.stopTracing());
	}
}
registerAction2(StopTracing);

CommandsRegistry.registerCommand('_issues.getSystemStatus', (accessor) => {
	return accessor.get(IProcessMainService).getSystemStatus();
});
//#endregion
