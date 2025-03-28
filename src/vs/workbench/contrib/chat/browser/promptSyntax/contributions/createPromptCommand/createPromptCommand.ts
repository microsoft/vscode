/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { createPromptFile } from './utils/createPromptFile.js';
import { CHAT_CATEGORY } from '../../../actions/chatActions.js';
import { askForPromptName } from './dialogs/askForPromptName.js';
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
import { IPromptPath, IPromptsService } from '../../../../common/promptSyntax/service/types.js';
import { IQuickInputService } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { CONFIGURE_SYNC_COMMAND_ID } from '../../../../../../services/userDataSync/common/userDataSync.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../../../../platform/userDataSync/common/userDataSync.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../../../platform/notification/common/notification.js';

/**
 * Base command ID prefix.
 */
const BASE_COMMAND_ID = 'workbench.command.prompts.create';

/**
 * Command ID for creating a 'local' prompt.
 */
const LOCAL_COMMAND_ID = `${BASE_COMMAND_ID}.local`;

/**
 * Command ID for creating a 'user' prompt.
 */
const USER_COMMAND_ID = `${BASE_COMMAND_ID}.user`;

/**
 * Title of the 'create local prompt' command.
 */
const LOCAL_COMMAND_TITLE = localize('commands.prompts.create.title.local', "Create Prompt");

/**
 * Title of the 'create user prompt' command.
 */
const USER_COMMAND_TITLE = localize('commands.prompts.create.title.user', "Create User Prompt");

/**
 * The command implementation.
 */
const command = async (
	accessor: ServicesAccessor,
	type: IPromptPath['type'],
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

	const fileName = await askForPromptName(type, quickInputService);
	if (!fileName) {
		return;
	}

	const selectedFolder = await askForPromptSourceFolder({
		type: type,
		labelService,
		openerService,
		promptsService,
		workspaceService,
		quickInputService,
	});

	if (!selectedFolder) {
		return;
	}

	const content = localize(
		'workbench.command.prompts.create.initial-content',
		"Add prompt contents...",
	);
	const promptUri = await createPromptFile({
		fileName,
		folder: selectedFolder,
		content,
		fileService,
		openerService,
	});

	await openerService.open(promptUri);

	if (type !== 'user') {
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

	// show suggestion to enable synchronization of the user prompts to the user
	notificationService.prompt(
		Severity.Info,
		localize(
			'workbench.command.prompts.create.user.enable-sync-notification',
			"User prompts are not currently synchronized. Do you want to enable synchronization of the user prompts?",
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

/**
 * Factory for creating the command handler with specific prompt `type`.
 */
const commandFactory = (type: 'local' | 'user') => {
	return async (accessor: ServicesAccessor): Promise<void> => {
		return command(accessor, type);
	};
};

/**
 * Register the "Create Prompt" command.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: LOCAL_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: commandFactory('local'),
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
});

/**
 * Register the "Create User Prompt" command.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USER_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: commandFactory('user'),
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
});

/**
 * Register the "Create Prompt" command in the command palette.
 */
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: LOCAL_COMMAND_ID,
		title: LOCAL_COMMAND_TITLE,
		category: CHAT_CATEGORY
	},
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
});

/**
 * Register the "Create User Prompt" command in the command palette.
 */
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: USER_COMMAND_ID,
		title: USER_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
});
