/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { OS } from '../../../../../base/common/platform.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { PromptsType, PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { UILabelProvider } from '../../../../../base/common/keybindingLabels.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
/**
 * Condition for the `Run Current Prompt` action.
 */
const EDITOR_ACTIONS_CONDITION = ContextKeyExpr.and(ChatContextKeys.enabled, ResourceContextKey.HasResource, ResourceContextKey.LangId.isEqualTo(PROMPT_LANGUAGE_ID));
/**
 * Keybinding of the action.
 */
const COMMAND_KEY_BINDING = 256 /* KeyMod.WinCtrl */ | 90 /* KeyCode.Slash */ | 512 /* KeyMod.Alt */;
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
export const CONFIGURE_PROMPTS_ACTION_ID = 'workbench.action.chat.configure.prompts';
/**
 * Base class of the `Run Prompt` action.
 */
class RunPromptBaseAction extends Action2 {
    constructor(options) {
        super({
            id: options.id,
            title: options.title,
            f1: false,
            precondition: ChatContextKeys.enabled,
            category: CHAT_CATEGORY,
            icon: options.icon,
            keybinding: {
                when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, EDITOR_ACTIONS_CONDITION),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
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
    async execute(resource, inNewChat, accessor) {
        const commandService = accessor.get(ICommandService);
        const promptsService = accessor.get(IPromptsService);
        const widgetService = accessor.get(IChatWidgetService);
        resource ||= getActivePromptFileUri(accessor);
        assertDefined(resource, 'Cannot find URI resource for an active text editor.');
        if (inNewChat === true) {
            await commandService.executeCommand(ACTION_ID_NEW_CHAT);
        }
        const widget = await widgetService.revealWidget();
        if (widget) {
            widget.setInput(`/${await promptsService.getPromptSlashCommandName(resource, CancellationToken.None)}`);
            // submit the prompt immediately
            await widget.acceptInput();
        }
        return widget;
    }
}
const RUN_CURRENT_PROMPT_ACTION_TITLE = localize2('run-prompt.capitalized', "Run Prompt in Current Chat");
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
    async run(accessor, resource) {
        return await super.execute(resource, false, accessor);
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: COMMAND_KEY_BINDING,
            },
            category: CHAT_CATEGORY,
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const instaService = accessor.get(IInstantiationService);
        const promptsService = accessor.get(IPromptsService);
        const widgetService = accessor.get(IChatWidgetService);
        const pickers = instaService.createInstance(PromptFilePickers);
        const placeholder = localize('commands.prompt.select-dialog.placeholder', 'Select the prompt file to run (hold {0}-key to use in new chat)', UILabelProvider.modifierLabels[OS].ctrlKey);
        const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.prompt });
        if (result === undefined) {
            return;
        }
        const { promptFile, keyMods } = result;
        if (keyMods.ctrlCmd === true) {
            await commandService.executeCommand(ACTION_ID_NEW_CHAT);
        }
        const widget = await widgetService.revealWidget();
        if (widget) {
            widget.setInput(`/${await promptsService.getPromptSlashCommandName(promptFile, CancellationToken.None)}`);
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
    async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const instaService = accessor.get(IInstantiationService);
        const pickers = instaService.createInstance(PromptFilePickers);
        const placeholder = localize('commands.prompt.manage-dialog.placeholder', 'Select the prompt file to open');
        const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.prompt, optionEdit: false });
        if (result !== undefined) {
            await openerService.open(result.promptFile);
        }
    }
}
/**
 * Gets `URI` of a prompt file open in an active editor instance, if any.
 */
function getActivePromptFileUri(accessor) {
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
const RUN_IN_NEW_CHAT_ACTION_TITLE = localize2('run-prompt-in-new-chat.capitalized', "Run Prompt In New Chat");
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
            keybinding: COMMAND_KEY_BINDING | 2048 /* KeyMod.CtrlCmd */,
            alt: {
                id: RUN_CURRENT_PROMPT_ACTION_ID,
                title: RUN_CURRENT_PROMPT_ACTION_TITLE,
                icon: RUN_CURRENT_PROMPT_ACTION_ICON,
            },
        });
    }
    async run(accessor, resource) {
        return await super.execute(resource, true, accessor);
    }
}
/**
 * Helper to register all the `Run Current Prompt` actions.
 */
export function registerRunPromptActions() {
    registerAction2(RunCurrentPromptInNewChatAction);
    registerAction2(RunCurrentPromptAction);
    registerAction2(RunSelectedPromptAction);
    registerAction2(ManagePromptFilesAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuUHJvbXB0QWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9ydW5Qcm9tcHRBY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBZSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN6RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFbkcsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBR3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRixPQUFPLEVBQW9CLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFakYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtC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