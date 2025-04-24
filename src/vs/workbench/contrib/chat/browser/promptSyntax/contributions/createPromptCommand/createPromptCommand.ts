/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { createPromptFile } from './utils/createPromptFile.js';
import { CHAT_CATEGORY } from '../../../actions/chatActions.js';
import { askForPromptFileName } from './dialogs/askForPromptName.js';
import { ChatContextKeys } from '../../../../common/chatContextKeys.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { askForPromptSourceFolder } from './dialogs/askForPromptSourceFolder.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { IPromptsService, TPromptsType } from '../../../../common/promptSyntax/service/types.js';
import { IQuickInputService } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { CONFIGURE_SYNC_COMMAND_ID } from '../../../../../../services/userDataSync/common/userDataSync.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../../../../platform/userDataSync/common/userDataSync.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../../../platform/notification/common/notification.js';

/**
 * The command implementation.
 */
const command = async (
	accessor: ServicesAccessor,
	type: TPromptsType,
): Promise<void> => {
	const logService = accessor.get(ILogService);
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);
	const openerService = accessor.get(IOpenerService);
	const promptsService = accessor.get(IPromptsService);
	const commandService = accessor.get(ICommandService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);
	const workspaceService = accessor.get(IWorkspaceContextService);
	const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);

	const placeHolder = (type === 'instructions')
		? localize(
			'workbench.command.instructions.create.location.placeholder',
			"Select a location to create the instructions file in...",
		)
		: localize(
			'workbench.command.prompt.create.location.placeholder',
			"Select a location to create the prompt file in...",
		);

	const selectedFolder = await askForPromptSourceFolder({
		type,
		placeHolder,
		labelService,
		openerService,
		promptsService,
		workspaceService,
		quickInputService,
	});

	if (!selectedFolder) {
		return;
	}

	const fileName = await askForPromptFileName(type, quickInputService);
	if (!fileName) {
		return;
	}

	const content = (type === 'instructions')
		? localize(
			'workbench.command.instructions.create.initial-content',
			"Add instructions...",
		)
		: localize(
			'workbench.command.prompt.create.initial-content',
			"Add prompt contents...",
		);
	const promptUri = await createPromptFile({
		fileName,
		folder: selectedFolder.uri,
		content,
		fileService,
		openerService,
	});

	await openerService.open(promptUri);

	if (selectedFolder.storage !== 'user') {
		return;
	}

	// due to PII concerns, synchronization of the 'user' reusable prompts
	// is disabled by default, but we want to make that fact clear to the user
	// hence after a 'user' prompt is create, we check if the synchronization
	// was explicitly configured before, and if it wasn't, we show a suggestion
	// to enable the synchronization logic in the Settings Sync configuration

	const isConfigured = userDataSyncEnablementService
		.isResourceEnablementConfigured(SyncResource.Prompts);
	const isSettingsSyncEnabled = userDataSyncEnablementService.isEnabled();

	// if prompts synchronization has already been configured before or
	// if settings sync service is currently disabled, nothing to do
	if ((isConfigured === true) || (isSettingsSyncEnabled === false)) {
		return;
	}

	// show suggestion to enable synchronization of the user prompts and instructions to the user
	notificationService.prompt(
		Severity.Info,
		localize(
			'workbench.command.prompts.create.user.enable-sync-notification',
			"User prompts and instructions are not currently synchronized. Do you want to enable synchronization of the user prompts and instructions?",
		),
		[
			{
				label: localize('enable.capitalized', "Enable"),
				run: () => {
					commandService.executeCommand(CONFIGURE_SYNC_COMMAND_ID)
						.catch((error) => {
							logService.error(`Failed to run '${CONFIGURE_SYNC_COMMAND_ID}' command: ${error}.`);
						});
				},
			}
		],
		{
			neverShowAgain: {
				id: 'workbench.command.prompts.create.user.enable-sync-notification',
				scope: NeverShowAgainScope.PROFILE,
			},
		},
	);
};

function register(type: TPromptsType, id: string, title: string) {
	/**
	 * Register the command.
	 */
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id,
		weight: KeybindingWeight.WorkbenchContrib,
		handler: async (accessor: ServicesAccessor): Promise<void> => {
			return command(accessor, type);
		},
		when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
	});

	/**
	 * Register the command in the command palette.
	 */
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id,
			title,
			category: CHAT_CATEGORY
		},
		when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
	});
}

export const NEW_PROMPT_COMMAND_ID = 'workbench.command.new.prompt';
export const NEW_INSTRUCTIONS_COMMAND_ID = 'workbench.command.new.instructions';

register(
	'instructions',
	NEW_INSTRUCTIONS_COMMAND_ID,
	localize('commands.new.instructions.local.title', "New Instructions File...")
);
register(
	'prompt',
	NEW_PROMPT_COMMAND_ID,
	localize('commands.new.prompt.local.title', "New Prompt File...")
);

