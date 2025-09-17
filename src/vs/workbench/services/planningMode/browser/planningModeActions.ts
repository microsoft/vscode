/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IPlanningModeService } from '../common/planningMode.js';
import { InPlanningModeContext } from '../common/planningModeContextKeys.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';

export class TogglePlanningModeAction extends Action2 {

	static readonly ID = 'workbench.action.togglePlanningMode';

	constructor() {
		super({
			id: TogglePlanningModeAction.ID,
			title: {
				...localize2('togglePlanningMode', "Toggle Planning Mode"),
				mnemonicTitle: localize({ key: 'miTogglePlanningMode', comment: ['&& denotes a mnemonic'] }, "&&Planning Mode"),
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP
			},
			menu: [{
				id: MenuId.MenubarAppearanceMenu,
				group: '1_toggle_view',
				order: 3
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const planningModeService = accessor.get(IPlanningModeService);
		const notificationService = accessor.get(INotificationService);
		const dialogService = accessor.get(IDialogService);

		try {
			if (planningModeService.isActive) {
				// Show confirmation dialog when deactivating
				const result = await dialogService.confirm({
					type: 'question',
					message: localize('planningMode.deactivateConfirm', "Exit Planning Mode?"),
					detail: localize('planningMode.deactivateDetail', "This will enable file editing again. Your conversation history will be preserved."),
					primaryButton: localize('planningMode.exitMode', "Exit Planning Mode"),
					cancelButton: localize('cancel', "Cancel")
				});

				if (result.confirmed) {
					await planningModeService.setActive(false);
				}
			} else {
				await planningModeService.setActive(true);
			}
		} catch (error) {
			notificationService.notify({
				severity: Severity.Error,
				message: localize('planningMode.toggleError', "Failed to toggle Planning Mode: {0}", error.message || error)
			});
		}
	}
}

export class ExportPlanningConversationAction extends Action2 {

	static readonly ID = 'workbench.action.exportPlanningConversation';

	constructor() {
		super({
			id: ExportPlanningConversationAction.ID,
			title: localize2('exportPlanningConversation', "Export Planning Conversation"),
			category: Categories.View,
			f1: true,
			precondition: InPlanningModeContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const planningModeService = accessor.get(IPlanningModeService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);

		try {
			const exportedContent = planningModeService.exportConversation();
			const summary = planningModeService.generateSummary();

			// Create a new untitled document with the conversation export
			await commandService.executeCommand('workbench.action.files.newUntitledFile', {
				content: exportedContent,
				language: 'markdown'
			});

			notificationService.notify({
				severity: Severity.Info,
				message: localize('planningMode.exported', "Planning conversation exported. Found {0} entries with {1} tools used.",
					summary.totalEntries,
					summary.toolsUsed.length
				)
			});

		} catch (error) {
			notificationService.notify({
				severity: Severity.Error,
				message: localize('planningMode.exportError', "Failed to export conversation: {0}", error.message || error)
			});
		}
	}
}

export class ClearPlanningConversationAction extends Action2 {

	static readonly ID = 'workbench.action.clearPlanningConversation';

	constructor() {
		super({
			id: ClearPlanningConversationAction.ID,
			title: localize2('clearPlanningConversation', "Clear Planning Conversation"),
			category: Categories.View,
			f1: true,
			precondition: InPlanningModeContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const planningModeService = accessor.get(IPlanningModeService);
		const dialogService = accessor.get(IDialogService);
		const notificationService = accessor.get(INotificationService);

		const result = await dialogService.confirm({
			type: 'warning',
			message: localize('planningMode.clearConfirm', "Clear conversation history?"),
			detail: localize('planningMode.clearDetail', "This will permanently delete all conversation entries. This action cannot be undone."),
			primaryButton: localize('planningMode.clear', "Clear History"),
			cancelButton: localize('cancel', "Cancel")
		});

		if (result.confirmed) {
			planningModeService.clearConversation();
			notificationService.notify({
				severity: Severity.Info,
				message: localize('planningMode.cleared', "Planning conversation history cleared.")
			});
		}
	}
}

registerAction2(TogglePlanningModeAction);
registerAction2(ExportPlanningConversationAction);
registerAction2(ClearPlanningConversationAction);
