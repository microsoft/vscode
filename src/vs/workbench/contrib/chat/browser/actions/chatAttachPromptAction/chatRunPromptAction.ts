/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../chatActions.js';
import { localize2 } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { TEXT_FILE_EDITOR_ID } from '../../../../files/common/files.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { Action2, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../../common/chatContextKeys.js';
import { getActivePromptUri } from '../../promptSyntax/contributions/usePromptCommand.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../../../common/contextkeys.js';
import { ATTACH_PROMPT_ACTION_ID, IChatAttachPromptActionOptions } from './chatAttachPromptAction.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * TODO: @legomushroom
 */
export interface IRunPromptOptions {
	resource: URI | undefined;
	inNewChat: boolean;
}

/**
 * TODO: @legomushroom
 */
abstract class RunPromptBaseAction extends Action2 {
	public async execute(
		accessor: ServicesAccessor,
		options: IRunPromptOptions,
	): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const {
			inNewChat,
			resource = getActivePromptUri(accessor),
		} = options;

		assertDefined(
			resource,
			'Cannot find URI resource for an active text editor.',
		);

		// if (inNewChat) {
		// 	await commandService
		// 		.executeCommand(ACTION_ID_NEW_CHAT);
		// }

		const attachOptions: IChatAttachPromptActionOptions = {
			resource,
			inNewChat,
			skipSelectionDialog: true,
		};

		return await commandService
			.executeCommand(ATTACH_PROMPT_ACTION_ID, attachOptions);
	}
}

/**
 * TODO: @legomushroom
 */
const EDITOR_ACTIONS_CONDITION = ContextKeyExpr.and(
	ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
	ChatContextKeyExprs.unifiedChatEnabled,
	ResourceContextKey.HasResource,
	ContextKeyExpr.regex(
		ResourceContextKey.Filename.key,
		/\.prompt\.md$/, // TODO: @lego - add custom instructions file
	),
	ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
);

/**
 * TODO: @legomushroom
 */
export const COMMAND_KEY_BINDING = KeyMod.WinCtrl | KeyCode.Slash | KeyMod.Alt;

/**
 * Action ID for the `Run Current Prompt` action.
 */
export const RUN_CURRENT_PROMPT_ACTION_ID = 'workbench.action.chat.run.prompt.current';

/**
 * TODO: @legomushroom
 */
export class RunCurrentPromptAction extends RunPromptBaseAction {
	constructor() {
		super({
			id: RUN_CURRENT_PROMPT_ACTION_ID,
			title: localize2(
				'workbench.action.chat.run.prompt.current.label',
				"Run Prompt",
			),
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			icon: Codicon.play,
			// TODO: @lego - remove
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib + 99,
				/**
				 * TODO: @legomushroom - also add keybinding to the "in new chat" action
				 */
				primary: COMMAND_KEY_BINDING,
			},
			menu: [
				{
					id: MenuId.EditorTitleRun,
					group: 'navigation',
					order: 0,
					alt: {
						id: RUN_CURRENT_PROMPT_IN_NEW_CHAT_ACTION_ID,
						title: RUN_IN_NEW_CHAT_ACTION_TITLE,
						icon: RUN_IN_NEW_CHAT_ACTION_ICON,
					},
					when: EDITOR_ACTIONS_CONDITION,
				},
			],
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		resource: URI | undefined,
	): Promise<void> {
		return await super.execute(
			accessor,
			{
				resource,
				inNewChat: false,
			},
		);
	}
}

/**
 * Action ID for the `Run Current Prompt In New Chat` action.
 */
export const RUN_CURRENT_PROMPT_IN_NEW_CHAT_ACTION_ID = 'workbench.action.chat.run-in-new-chat.prompt.current';

const RUN_IN_NEW_CHAT_ACTION_TITLE = localize2(
	'workbench.action.chat.run-in-new-chat.prompt.current.label',
	"Run Prompt In New Chat",
);

/**
 * TODO: @legomushroom
 */
const RUN_IN_NEW_CHAT_ACTION_ICON = Codicon.playCircle;

/**
 * TODO: @legomushroom
 */
export class RunCurrentPromptInNewChatAction extends RunPromptBaseAction {
	constructor() {
		super({
			id: RUN_CURRENT_PROMPT_IN_NEW_CHAT_ACTION_ID,
			title: RUN_IN_NEW_CHAT_ACTION_TITLE,
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			icon: RUN_IN_NEW_CHAT_ACTION_ICON,
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib + 99,
				/**
				 * TODO: @legomushroom - also add keybinding to the "in new chat" action
				 */
				primary: COMMAND_KEY_BINDING | KeyMod.CtrlCmd,
			},
			menu: [
				{
					id: MenuId.EditorTitleRun,
					group: 'navigation',
					order: 1,
					when: EDITOR_ACTIONS_CONDITION,
				},
			],
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		resource: URI,
	): Promise<void> {
		return await super.execute(
			accessor,
			{
				resource,
				inNewChat: true,
			},
		);
	}
}

// /**
//  * TODO: @legomushroom
//  */
// export const registerReusablePromptActions = () => {
// 	registerAction2(AttachPromptAction);
// 	registerAction2(RunCurrentPromptAction);
// 	registerAction2(RunCurrentPromptInNewChatAction);
// };
