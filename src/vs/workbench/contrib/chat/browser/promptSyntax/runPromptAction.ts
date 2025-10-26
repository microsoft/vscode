/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatViewId, IChatWidget, showChatView } from '../chat.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { URI } from '../../../../../base/common/uri.js';
import { OS } from '../../../../../base/common/platform.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { PromptsType, PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { ILocalizedString, localize, localize2 } from '../../../../../nls.js';
import { UILabelProvider } from '../../../../../base/common/keybindingLabels.js';
import { ICommandAction } from '../../../../../platform/action/common/action.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';

/**
 * Condition for the `Run Current Prompt` action.
 */
const EDITOR_ACTIONS_CONDITION = ContextKeyExpr.and(
	ChatContextKeys.enabled,
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
 * Action ID for the `Configure Prompt Files...` action.
 */
const CONFIGURE_PROMPTS_ACTION_ID = 'workbench.action.chat.configure.prompts';

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
			precondition: ChatContextKeys.enabled,
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
					order: options.alt ? 0 : 1,
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
	): Promise<IChatWidget | undefined> {
		const viewsService = accessor.get(IViewsService);
		const commandService = accessor.get(ICommandService);
		const promptsService = accessor.get(IPromptsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		resource ||= getActivePromptFileUri(accessor);
		assertDefined(
			resource,
			'Cannot find URI resource for an active text editor.',
		);

		if (inNewChat === true) {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}

		const widget = await showChatView(viewsService, layoutService);
		if (widget) {
			widget.setInput(`/${await promptsService.getPromptCommandName(resource)}`);
			// submit the prompt immediately
			await widget.acceptInput();
		}
		return widget;
	}
}

const RUN_CURRENT_PROMPT_ACTION_TITLE = localize2(
	'run-prompt.capitalized',
	"Run Prompt in Current Chat"
);
const RUN_CURRENT_PROMPT_ACTION_ICON = Codicon.playCircle;

/**
 * The default `Run Current Prompt` action.
 */
class RunCurrentPromptAction extends RunPromptBaseAction {
	constructor() {
		super({
			id: RUN_CURRENT_PROMPT_ACTION_ID,
			title: RUN_CURRENT_PROMPT_ACTION_TITLE,
			icon: RUN_CURRENT_PROMPT_ACTION_ICON,
			keybinding: COMMAND_KEY_BINDING,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		resource: URI | undefined,
	): Promise<IChatWidget | undefined> {
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
			precondition: ChatContextKeys.enabled,
			keybinding: {
				when: ChatContextKeys.enabled,
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
		const commandService = accessor.get(ICommandService);
		const instaService = accessor.get(IInstantiationService);
		const promptsService = accessor.get(IPromptsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		const pickers = instaService.createInstance(PromptFilePickers);

		const placeholder = localize(
			'commands.prompt.select-dialog.placeholder',
			'Select the prompt file to run (hold {0}-key to use in new chat)',
			UILabelProvider.modifierLabels[OS].ctrlKey
		);

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.prompt });

		if (result === undefined) {
			return;
		}

		const { promptFile, keyMods } = result;

		if (keyMods.ctrlCmd === true) {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}

		const widget = await showChatView(viewsService, layoutService);
		if (widget) {
			widget.setInput(`/${await promptsService.getPromptCommandName(promptFile)}`);
			// submit the prompt immediately
			await widget.acceptInput();
			widget.focusInput();
		}
	}
}

class ManagePromptFilesAction extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_PROMPTS_ACTION_ID,
			title: localize2('configure-prompts', "Configure Prompt Files..."),
			shortTitle: localize2('configure-prompts.short', "Prompt Files"),
			icon: Codicon.bookmark,
			f1: true,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			menu: {
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
				order: 11,
				group: '0_level'
			},
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const instaService = accessor.get(IInstantiationService);

		const pickers = instaService.createInstance(PromptFilePickers);

		const placeholder = localize(
			'commands.prompt.manage-dialog.placeholder',
			'Select the prompt file to open'
		);

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.prompt, optionEdit: false });
		if (result !== undefined) {
			await openerService.open(result.promptFile);
		}
	}
}


/**
 * Gets `URI` of a prompt file open in an active editor instance, if any.
 */
function getActivePromptFileUri(accessor: ServicesAccessor): URI | undefined {
	const codeEditorService = accessor.get(ICodeEditorService);
	const model = codeEditorService.getActiveCodeEditor()?.getModel();
	if (model?.getLanguageId() === PROMPT_LANGUAGE_ID) {
		return model.uri;
	}
	return undefined;
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
const RUN_IN_NEW_CHAT_ACTION_ICON = Codicon.play;

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
			alt: {
				id: RUN_CURRENT_PROMPT_ACTION_ID,
				title: RUN_CURRENT_PROMPT_ACTION_TITLE,
				icon: RUN_CURRENT_PROMPT_ACTION_ICON,
			},
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		resource: URI,
	): Promise<IChatWidget | undefined> {
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
export function registerRunPromptActions(): void {
	registerAction2(RunCurrentPromptInNewChatAction);
	registerAction2(RunCurrentPromptAction);
	registerAction2(RunSelectedPromptAction);
	registerAction2(ManagePromptFilesAction);
}
