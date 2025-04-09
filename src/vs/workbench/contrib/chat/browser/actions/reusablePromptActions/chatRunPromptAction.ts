/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../chatActions.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { runAttachPromptAction } from './chatAttachPromptAction.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { ILocalizedString, localize2 } from '../../../../../../nls.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { TEXT_FILE_EDITOR_ID } from '../../../../files/common/files.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { ICommandAction } from '../../../../../../platform/action/common/action.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { getActivePromptUri } from '../../promptSyntax/contributions/usePromptCommand.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../../../common/contextkeys.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';

/**
 * Constructor options for the `Run Prompt` base action.
 */
interface IRunPromptBaseActionConstructorOptions {
	/**
	 * ID of the action to be registered.
	 */
	id: string;

	/**
	 * Title of the action.
	 */
	title: ILocalizedString;

	/**
	 * Icon of the action.
	 */
	icon: ThemeIcon;

	/**
	 * Keybinding of the action.
	 */
	keybinding: number;

	/**
	 * Alt action of the UI menu item.
	 */
	alt?: ICommandAction;
}

/**
 * Base class of the `Run Prompt` action.
 */
abstract class RunPromptBaseAction extends Action2 {
	constructor(
		options: IRunPromptBaseActionConstructorOptions,
	) {
		super({
			id: options.id,
			title: options.title,
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			icon: options.icon,
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: options.keybinding,
			},
			menu: [
				{
					id: MenuId.EditorTitleRun,
					group: 'navigation',
					order: 0,
					alt: options.alt,
					when: EDITOR_ACTIONS_CONDITION,
				},
			],
		});
	}

	/**
	 * Executes the run prompt action with provided options.
	 */
	public async execute(
		resource: URI | undefined,
		inNewChat: boolean,
		accessor: ServicesAccessor,
	): Promise<void> {
		const commandService = accessor.get(ICommandService);

		resource ||= getActivePromptUri(accessor);
		assertDefined(
			resource,
			'Cannot find URI resource for an active text editor.',
		);

		return await runAttachPromptAction({
			resource,
			inNewChat,
			skipSelectionDialog: true,
		}, commandService);
	}
}

/**
 * Condition for the `Run Current Prompt` action.
 */
const EDITOR_ACTIONS_CONDITION = ContextKeyExpr.and(
	ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
	ResourceContextKey.HasResource,
	ContextKeyExpr.regex(
		ResourceContextKey.Filename.key,
		/\.prompt\.md|copilot-instructions\.md$/,
	),
	ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
);

/**
 * Keybinding of the action.
 */
const COMMAND_KEY_BINDING = KeyMod.WinCtrl | KeyCode.Slash | KeyMod.Alt;

/**
 * Action ID for the `Run Current Prompt` action.
 */
const RUN_CURRENT_PROMPT_ACTION_ID = 'workbench.action.chat.run.prompt.current';

/**
 * The default `Run Current Prompt` action.
 */
class RunCurrentPromptAction extends RunPromptBaseAction {
	constructor() {
		super({
			id: RUN_CURRENT_PROMPT_ACTION_ID,
			title: localize2(
				'run-prompt.capitalized', "Run Prompt",
			),
			icon: Codicon.play,
			keybinding: COMMAND_KEY_BINDING,
			alt: {
				id: RUN_CURRENT_PROMPT_IN_NEW_CHAT_ACTION_ID,
				title: RUN_IN_NEW_CHAT_ACTION_TITLE,
				icon: RUN_IN_NEW_CHAT_ACTION_ICON,
			},
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		resource: URI | undefined,
	): Promise<void> {
		return await super.execute(
			resource,
			false,
			accessor,
		);
	}
}

/**
 * Action ID for the `Run Current Prompt In New Chat` action.
 */
const RUN_CURRENT_PROMPT_IN_NEW_CHAT_ACTION_ID = 'workbench.action.chat.run-in-new-chat.prompt.current';

const RUN_IN_NEW_CHAT_ACTION_TITLE = localize2(
	'run-prompt-in-new-chat.capitalized',
	"Run Prompt In New Chat",
);

/**
 * Icon for the `Run Current Prompt In New Chat` action.
 */
const RUN_IN_NEW_CHAT_ACTION_ICON = Codicon.playCircle;

/**
 * `Run Current Prompt In New Chat` action.
 */
class RunCurrentPromptInNewChatAction extends RunPromptBaseAction {
	constructor() {
		super({
			id: RUN_CURRENT_PROMPT_IN_NEW_CHAT_ACTION_ID,
			title: RUN_IN_NEW_CHAT_ACTION_TITLE,
			icon: RUN_IN_NEW_CHAT_ACTION_ICON,
			keybinding: COMMAND_KEY_BINDING | KeyMod.CtrlCmd,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		resource: URI,
	): Promise<void> {
		return await super.execute(
			resource,
			true,
			accessor,
		);
	}
}

/**
 * Helper to register all the `Run Current Prompt` actions.
 */
export const registerRunPromptActions = () => {
	registerAction2(RunCurrentPromptAction);
	registerAction2(RunCurrentPromptInNewChatAction);
};
