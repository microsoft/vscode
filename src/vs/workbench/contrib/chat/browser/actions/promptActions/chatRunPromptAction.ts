/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../chat.js';
import { CHAT_CATEGORY } from '../chatActions.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OS } from '../../../../../../base/common/platform.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ResourceContextKey } from '../../../../../common/contextkeys.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/constants.js';
import { IPromptsService } from '../../../common/promptSyntax/service/types.js';
import { ILocalizedString, localize, localize2 } from '../../../../../../nls.js';
import { UILabelProvider } from '../../../../../../base/common/keybindingLabels.js';
import { ICommandAction } from '../../../../../../platform/action/common/action.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { PromptFilePickers } from './dialogs/askToSelectPrompt/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IRunPromptOptions, runPromptFile } from './dialogs/askToSelectPrompt/utils/runPrompt.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Condition for the `Run Current Prompt` action.
 */
const EDITOR_ACTIONS_CONDITION = ContextKeyExpr.and(
	ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
	ResourceContextKey.HasResource,
	ResourceContextKey.LangId.isEqualTo(PROMPT_LANGUAGE_ID),
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
 * Action ID for the `Run Prompt...` action.
 */
const RUN_SELECTED_PROMPT_ACTION_ID = 'workbench.action.chat.run.prompt';

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
				when: ContextKeyExpr.and(
					EditorContextKeys.editorTextFocus,
					EDITOR_ACTIONS_CONDITION,
				),
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
	): Promise<IChatWidget> {
		const viewsService = accessor.get(IViewsService);
		const commandService = accessor.get(ICommandService);

		resource ||= getActivePromptFileUri(accessor);
		assertDefined(
			resource,
			'Cannot find URI resource for an active text editor.',
		);

		const { widget } = await runPromptFile(
			resource,
			{
				inNewChat,
				commandService,
				viewsService,
			},
		);

		return widget;
	}
}

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
	): Promise<IChatWidget> {
		return await super.execute(
			resource,
			false,
			accessor,
		);
	}
}

class RunSelectedPromptAction extends Action2 {
	constructor() {
		super({
			id: RUN_SELECTED_PROMPT_ACTION_ID,
			title: localize2('run-prompt.capitalized.ellipses', "Run Prompt..."),
			icon: Codicon.bookmark,
			f1: true,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			keybinding: {
				when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: COMMAND_KEY_BINDING,
			},
			category: CHAT_CATEGORY,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const promptsService = accessor.get(IPromptsService);
		const commandService = accessor.get(ICommandService);
		const instaService = accessor.get(IInstantiationService);

		const pickers = instaService.createInstance(PromptFilePickers);

		// find all prompt files in the user workspace
		const promptFiles = await promptsService.listPromptFiles('prompt');
		const placeholder = localize(
			'commands.prompt.select-dialog.placeholder',
			'Select the prompt file to run (hold {0}-key to use in new chat)',
			UILabelProvider.modifierLabels[OS].ctrlKey
		);

		const result = await pickers.selectPromptFile({ promptFiles, placeholder });

		if (result === undefined) {
			return;
		}

		const { promptFile, keyMods } = result;
		const runPromptOptions: IRunPromptOptions = {
			inNewChat: keyMods.ctrlCmd,
			viewsService,
			commandService,
		};
		const { widget } = await runPromptFile(
			promptFile,
			runPromptOptions,
		);
		widget.focusInput();
	}
}


/**
 * Gets `URI` of a prompt file open in an active editor instance, if any.
 */
export const getActivePromptFileUri = (
	accessor: ServicesAccessor,
): URI | undefined => {
	const codeEditorService = accessor.get(ICodeEditorService);
	const model = codeEditorService.getActiveCodeEditor()?.getModel();
	if (model?.getLanguageId() === PROMPT_LANGUAGE_ID) {
		return model.uri;
	}
	return undefined;
};


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
	): Promise<IChatWidget> {
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
	registerAction2(RunSelectedPromptAction);
};
