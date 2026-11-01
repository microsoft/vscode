/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IKeybindingTeacherService } from '../common/keybindingTeacher.js';
import { KeybindingTeacherService } from './keybindingTeacherService.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickPickItem, IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { localize } from '../../../../nls.js';
import '../common/keybindingTeacherConfiguration.js';

/**
 * Workbench contribution that ensures the keybinding teacher service is instantiated.
 * Even though the service is registered as InstantiationType.Eager, it still needs
 * to be requested by something to actually instantiate. This contribution serves
 * that purpose by injecting the service in its constructor, causing it to be
 * instantiated during workbench initialization.
 */
class KeybindingTeacherContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.keybindingTeacher';

	constructor(
		@IKeybindingTeacherService _keybindingTeacherService: IKeybindingTeacherService
	) {
		super();
	}
}

registerSingleton(IKeybindingTeacherService, KeybindingTeacherService, InstantiationType.Eager);

registerWorkbenchContribution2(KeybindingTeacherContribution.ID, KeybindingTeacherContribution, WorkbenchPhase.BlockRestore);

registerAction2(class ManageDismissedCommandsAction extends Action2 {
	constructor() {
		super({
			id: 'keybindingTeacher.manageDismissedCommands',
			title: { value: localize('manageDismissedCommands', "Manage Dismissed Suggestions"), original: 'Manage Dismissed Suggestions' },
			category: { value: localize('manageDismissedCommandsCategory', "Keybinding Teacher"), original: 'Keybinding Teacher' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingTeacherService = accessor.get(IKeybindingTeacherService);
		const quickInputService = accessor.get(IQuickInputService);
		const keybindingService = accessor.get(IKeybindingService);

		const dismissedCommands = keybindingTeacherService.getDismissedCommands();

		if (dismissedCommands.length === 0) {
			await quickInputService.pick([{
				label: localize('noDismissedCommands', "No dismissed commands"),
				description: localize('noDismissedCommandsDesc', "You have not dismissed any keybinding suggestions")
			}], {
				placeHolder: localize('dismissedCommandsPlaceholder', "Dismissed Commands")
			});
			return;
		}

		const picks: (IQuickPickItem & { commandId: string })[] = dismissedCommands.map(commandId => {
			const keybinding = keybindingService.lookupKeybinding(commandId);
			const keybindingLabel = keybinding?.getLabel() || localize('noKeybinding', "No keybinding");

			return {
				label: commandId,
				description: keybindingLabel,
				commandId
			};
		});

		const selected = await quickInputService.pick(picks, {
			placeHolder: localize('selectCommandToReEnable', "Select a command to re-enable suggestions"),
			canPickMany: true
		});

		if (selected && selected.length > 0) {
			for (const item of selected) {
				keybindingTeacherService.undismissCommand(item.commandId);
			}
		}
	}
});

registerAction2(class ClearAllDataAction extends Action2 {
	constructor() {
		super({
			id: 'keybindingTeacher.clearAllData',
			title: { value: localize('clearAllData', "Clear All Data"), original: 'Clear All Data' },
			category: { value: localize('clearAllDataCategory', "Keybinding Teacher"), original: 'Keybinding Teacher' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingTeacherService = accessor.get(IKeybindingTeacherService);
		const dialogService = accessor.get(IDialogService);

		const { confirmed } = await dialogService.confirm({
			message: localize('confirmClearMessage', "Clear all keybinding teacher data?"),
			detail: localize('confirmClearDetail', "This will clear all dismissed commands and usage counts."),
			primaryButton: localize('clearButton', "Clear")
		});

		if (confirmed) {
			keybindingTeacherService.resetAllStats();
		}
	}
});
