/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { getLanguageIdForPromptsType, PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CONFIGURE_SYNC_COMMAND_ID } from '../../../../services/userDataSync/common/userDataSync.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { askForPromptFileName } from './pickers/askForPromptName.js';
import { askForPromptSourceFolder } from './pickers/askForPromptSourceFolder.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { getCleanPromptName, SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { getTarget } from '../../common/promptSyntax/languageProviders/promptFileAttributes.js';
class AbstractNewPromptFileAction extends Action2 {
    constructor(id, title, type) {
        super({
            id,
            title,
            f1: false,
            precondition: ChatContextKeys.enabled,
            category: CHAT_CATEGORY,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.CommandPalette,
                when: ChatContextKeys.enabled
            }
        });
        this.type = type;
    }
    async run(accessor, options) {
        const logService = accessor.get(ILogService);
        const openerService = accessor.get(IOpenerService);
        const commandService = accessor.get(ICommandService);
        const notificationService = accessor.get(INotificationService);
        const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const instaService = accessor.get(IInstantiationService);
        let folderUri;
        let storage;
        if (options?.targetFolder) {
            folderUri = options.targetFolder;
            storage = options.targetStorage ?? PromptsStorage.local;
        }
        else {
            const selectedFolder = await instaService.invokeFunction(askForPromptSourceFolder, this.type);
            if (!selectedFolder) {
                return;
            }
            folderUri = selectedFolder.uri;
            storage = selectedFolder.storage;
        }
        const fileName = await instaService.invokeFunction(askForPromptFileName, this.type, folderUri, undefined, options?.fileExtension);
        if (!fileName) {
            return;
        }
        // create the prompt file
        await fileService.createFolder(folderUri);
        const promptUri = URI.joinPath(folderUri, fileName);
        await fileService.createFile(promptUri);
        const cleanName = getCleanPromptName(promptUri);
        let editor;
        if (options?.openFile) {
            editor = await options.openFile(promptUri);
        }
        else {
            await openerService.open(promptUri);
            editor = getCodeEditor(editorService.activeTextEditorControl);
        }
        if (editor && editor.hasModel() && isEqual(editor.getModel().uri, promptUri)) {
            SnippetController2.get(editor)?.apply([{
                    range: editor.getModel().getFullModelRange(),
                    template: getDefaultContentSnippet(this.type, cleanName, getTarget(this.type, promptUri)),
                }]);
        }
        if (storage !== 'user') {
            return;
        }
        // due to PII concerns, synchronization of the 'user' reusable prompts
        // is disabled by default, but we want to make that fact clear to the user
        // hence after a 'user' prompt is create, we check if the synchronization
        // was explicitly configured before, and if it wasn't, we show a suggestion
        // to enable the synchronization logic in the Settings Sync configuration
        const isConfigured = userDataSyncEnablementService
            .isResourceEnablementConfigured("prompts" /* SyncResource.Prompts */);
        const isSettingsSyncEnabled = userDataSyncEnablementService.isEnabled();
        // if prompts synchronization has already been configured before or
        // if settings sync service is currently disabled, nothing to do
        if ((isConfigured === true) || (isSettingsSyncEnabled === false)) {
            return;
        }
        // show suggestion to enable synchronization of the user prompts and instructions to the user
        notificationService.prompt(Severity.Info, localize('workbench.command.prompts.create.user.enable-sync-notification', "Do you want to backup and sync your user prompt, instruction and custom agent files with Setting Sync?'"), [
            {
                label: localize('enable.capitalized', "Enable"),
                run: () => {
                    commandService.executeCommand(CONFIGURE_SYNC_COMMAND_ID)
                        .catch((error) => {
                        logService.error(`Failed to run '${CONFIGURE_SYNC_COMMAND_ID}' command: ${error}.`);
                    });
                },
            },
            {
                label: localize('learnMore.capitalized', "Learn More"),
                run: () => {
                    openerService.open(URI.parse('https://aka.ms/vscode-settings-sync-help'));
                },
            },
        ], {
            neverShowAgain: {
                id: 'workbench.command.prompts.create.user.enable-sync-notification',
                scope: NeverShowAgainScope.PROFILE,
            },
        });
    }
}
function getDefaultContentSnippet(promptType, name, target) {
    switch (promptType) {
        case PromptsType.prompt:
            return [
                `---`,
                `name: ${name ?? '${1:prompt-name}'}`,
                `description: \${2:Describe when to use this prompt}`,
                `---`,
                ``,
                `<!-- Tip: Use /create-prompt in chat to generate content with agent assistance -->`,
                ``,
                `\${3:Define the prompt content here. You can include instructions, examples, and any other relevant information to guide the AI's responses.}`,
            ].join('\n');
        case PromptsType.instructions:
            if (target === Target.Claude) {
                return [
                    `---`,
                    `description: \${1:Describe when these instructions should be loaded}`,
                    `paths:`,
                    `. - "src/**/*.ts"`,
                    `---`,
                    ``,
                    `<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->`,
                    ``,
                    `\${2:Provide coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.}`,
                ].join('\n');
            }
            else {
                return [
                    `---`,
                    `description: \${1:Describe when these instructions should be loaded by the agent based on task context}`,
                    `# applyTo: '\${1|**,**/*.ts|}' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file`,
                    `---`,
                    ``,
                    `<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->`,
                    ``,
                    `\${2:Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.}`,
                ].join('\n');
            }
        case PromptsType.agent:
            if (target === Target.Claude) {
                return [
                    `---`,
                    `name: ${name ?? '${1:agent-name}'}`,
                    `description: \${2:Describe what this custom agent does and when to use it.}`,
                    `tools: Read, Grep, Glob, Bash # specify the tools this agent can use. If not set, all enabled tools are allowed.`,
                    `---`,
                    ``,
                    `<!-- Tip: Use /create-agent in chat to generate content with agent assistance -->`,
                    ``,
                    `\${4:Define what this custom agent does, including its behavior, capabilities, and any specific instructions for its operation.}`,
                ].join('\n');
            }
            else {
                return [
                    `---`,
                    `name: ${name ?? '${1:agent-name}'}`,
                    `description: \${2:Describe what this custom agent does and when to use it.}`,
                    `argument-hint: \${3:The inputs this agent expects, e.g., "a task to implement" or "a question to answer".}`,
                    `# tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo'] # specify the tools this agent can use. If not set, all enabled tools are allowed.`,
                    `---`,
                    ``,
                    `<!-- Tip: Use /create-agent in chat to generate content with agent assistance -->`,
                    ``,
                    `\${4:Define what this custom agent does, including its behavior, capabilities, and any specific instructions for its operation.}`,
                ].join('\n');
            }
        case PromptsType.skill:
            return [
                `---`,
                `name: ${name ?? '${1:skill-name}'}`,
                `description: \${2:Describe what this skill does and when to use it. Include keywords that help agents identify relevant tasks.}`,
                `---`,
                ``,
                `<!-- Tip: Use /create-skill in chat to generate content with agent assistance -->`,
                ``,
                `\${3:Define the functionality provided by this skill, including detailed instructions and examples}`,
            ].join('\n');
        default:
            throw new Error(`Unsupported prompt type: ${promptType}`);
    }
}
export const NEW_PROMPT_COMMAND_ID = 'workbench.command.new.prompt';
export const NEW_INSTRUCTIONS_COMMAND_ID = 'workbench.command.new.instructions';
export const NEW_AGENT_COMMAND_ID = 'workbench.command.new.agent';
export const NEW_SKILL_COMMAND_ID = 'workbench.command.new.skill';
class NewPromptFileAction extends AbstractNewPromptFileAction {
    constructor() {
        super(NEW_PROMPT_COMMAND_ID, localize('commands.new.prompt.local.title', "New Prompt File..."), PromptsType.prompt);
    }
}
class NewInstructionsFileAction extends AbstractNewPromptFileAction {
    constructor() {
        super(NEW_INSTRUCTIONS_COMMAND_ID, localize('commands.new.instructions.local.title', "New Instructions File..."), PromptsType.instructions);
    }
}
class NewAgentFileAction extends AbstractNewPromptFileAction {
    constructor() {
        super(NEW_AGENT_COMMAND_ID, localize('commands.new.agent.local.title', "New Custom Agent..."), PromptsType.agent);
    }
}
class NewSkillFileAction extends Action2 {
    constructor() {
        super({
            id: NEW_SKILL_COMMAND_ID,
            title: localize('commands.new.skill.local.title', "New Skill File..."),
            f1: false,
            precondition: ChatContextKeys.enabled,
            category: CHAT_CATEGORY,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.CommandPalette,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, options) {
        const openerService = accessor.get(IOpenerService);
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const instaService = accessor.get(IInstantiationService);
        const quickInputService = accessor.get(IQuickInputService);
        let folderUri;
        if (options?.targetFolder) {
            folderUri = options.targetFolder;
        }
        else {
            const selectedFolder = await instaService.invokeFunction(askForPromptSourceFolder, PromptsType.skill);
            if (!selectedFolder) {
                return;
            }
            folderUri = selectedFolder.uri;
        }
        // Ask for skill name (will be the folder name)
        // Per agentskills.io/specification: name must be 1-64 chars, lowercase alphanumeric + hyphens,
        // no leading/trailing hyphens, no consecutive hyphens, must match folder name
        const skillName = await quickInputService.input({
            prompt: localize('commands.new.skill.name.prompt', "Enter a name for the skill (lowercase letters, numbers, and hyphens only)"),
            placeHolder: localize('commands.new.skill.name.placeholder', "e.g., pdf-processing, data-analysis"),
            validateInput: async (value) => {
                if (!value || !value.trim()) {
                    return localize('commands.new.skill.name.required', "Skill name is required");
                }
                const name = value.trim();
                if (name.length > 64) {
                    return localize('commands.new.skill.name.tooLong', "Skill name must be 64 characters or less");
                }
                // Per spec: lowercase alphanumeric and hyphens only
                if (!VALID_SKILL_NAME_REGEX.test(name)) {
                    return localize('commands.new.skill.name.invalidChars', "Skill name may only contain lowercase letters, numbers, and hyphens");
                }
                if (name.startsWith('-') || name.endsWith('-')) {
                    return localize('commands.new.skill.name.hyphenEdge', "Skill name must not start or end with a hyphen");
                }
                if (name.includes('--')) {
                    return localize('commands.new.skill.name.consecutiveHyphens', "Skill name must not contain consecutive hyphens");
                }
                return undefined;
            }
        });
        if (!skillName) {
            return;
        }
        const trimmedName = skillName.trim();
        // Create the skill folder and SKILL.md file
        const skillFolder = URI.joinPath(folderUri, trimmedName);
        await fileService.createFolder(skillFolder);
        const skillFileUri = URI.joinPath(skillFolder, SKILL_FILENAME);
        await fileService.createFile(skillFileUri);
        let editor;
        if (options?.openFile) {
            editor = await options.openFile(skillFileUri);
        }
        else {
            await openerService.open(skillFileUri);
            editor = getCodeEditor(editorService.activeTextEditorControl);
        }
        if (editor && editor.hasModel() && isEqual(editor.getModel().uri, skillFileUri)) {
            SnippetController2.get(editor)?.apply([{
                    range: editor.getModel().getFullModelRange(),
                    template: getDefaultContentSnippet(PromptsType.skill, trimmedName, Target.Undefined),
                }]);
        }
    }
}
class NewUntitledPromptFileAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.command.new.untitled.prompt',
            title: localize2('commands.new.untitled.prompt.title', "New Untitled Prompt File"),
            f1: true,
            precondition: ChatContextKeys.enabled,
            category: CHAT_CATEGORY,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const languageId = getLanguageIdForPromptsType(PromptsType.prompt);
        const input = await editorService.openEditor({
            resource: undefined,
            languageId,
            options: {
                pinned: true
            }
        });
        const type = PromptsType.prompt;
        const editor = getCodeEditor(editorService.activeTextEditorControl);
        if (editor && editor.hasModel()) {
            SnippetController2.get(editor)?.apply([{
                    range: editor.getModel().getFullModelRange(),
                    template: getDefaultContentSnippet(type, undefined, Target.Undefined),
                }]);
        }
        return input;
    }
}
export function registerNewPromptFileActions() {
    registerAction2(NewPromptFileAction);
    registerAction2(NewInstructionsFileAction);
    registerAction2(NewAgentFileAction);
    registerAction2(NewSkillFileAction);
    registerAction2(NewUntitledPromptFileAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3UHJvbXB0RmlsZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L25ld1Byb21wdEZpbGVBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGFBQWEsRUFBZSxNQUFNLGdEQUFnRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFFeEgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNsSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1RyxPQUFPLEVBQUUsOEJBQThCLEVBQWdCLE1BQU0sNkRBQTZELENBQUM7QUFDM0gsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDMUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFtQmhHLE1BQU0sMkJBQTRCLFNBQVEsT0FBTztJQUVoRCxZQUFZLEVBQVUsRUFBRSxLQUFhLEVBQW1CLElBQWlCO1FBQ3hFLEtBQUssQ0FBQztZQUNMLEVBQUU7WUFDRixLQUFLO1lBQ0wsRUFBRSxFQUFFLEtBQUs7WUFDVCxZQUFZLEVBQUUsZUFBZSxDQUFDLE9BQU87WUFDckMsUUFBUSxFQUFFLGFBQWE7WUFDdkIsVUFBVSxFQUFFO2dCQUNYLE1BQU0sNkNBQW1DO2FBQ3pDO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztnQkFDekIsSUFBSSxFQUFFLGVBQWUsQ0FBQyxPQUFPO2FBQzdCO1NBQ0QsQ0FBQyxDQUFDO1FBZG9ELFNBQUksR0FBSixJQUFJLENBQWE7SUFlekUsQ0FBQztJQUVlLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxPQUEyQjtRQUNoRixNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdDLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbkQsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxNQUFNLG1CQUFtQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMvRCxNQUFNLDZCQUE2QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNuRixNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDL0MsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRXpELElBQUksU0FBYyxDQUFDO1FBQ25CLElBQUksT0FBZSxDQUFDO1FBQ3BCLElBQUksT0FBTyxFQUFFLFlBQVksRUFBRSxDQUFDO1lBQzNCLFNBQVMsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDO1lBQ2pDLE9BQU8sR0FBRyxPQUFPLENBQUMsYUFBYSxJQUFJLGNBQWMsQ0FBQyxLQUFLLENBQUM7UUFDekQsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLGNBQWMsR0FBRyxNQUFNLFlBQVksQ0FBQyxjQUFjLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlGLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDckIsT0FBTztZQUNSLENBQUM7WUFDRCxTQUFTLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQztZQUMvQixPQUFPLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQztRQUNsQyxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxZQUFZLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbEksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTztRQUNSLENBQUM7UUFDRCx5QkFBeUI7UUFFekIsTUFBTSxXQUFXLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTFDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sV0FBVyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV4QyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVoRCxJQUFJLE1BQXNDLENBQUM7UUFDM0MsSUFBSSxPQUFPLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDdkIsTUFBTSxHQUFHLE1BQU0sT0FBTyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNwQyxNQUFNLEdBQUcsYUFBYSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFDRCxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUM5RSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3RDLEtBQUssRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsaUJBQWlCLEVBQUU7b0JBQzVDLFFBQVEsRUFBRSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztpQkFDekYsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsSUFBSSxPQUFPLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCxzRUFBc0U7UUFDdEUsMEVBQTBFO1FBQzFFLHlFQUF5RTtRQUN6RSwyRUFBMkU7UUFDM0UseUVBQXlFO1FBRXpFLE1BQU0sWUFBWSxHQUFHLDZCQUE2QjthQUNoRCw4QkFBOEIsc0NBQXNCLENBQUM7UUFDdkQsTUFBTSxxQkFBcUIsR0FBRyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUV4RSxtRUFBbUU7UUFDbkUsZ0VBQWdFO1FBQ2hFLElBQUksQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsS0FBSyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xFLE9BQU87UUFDUixDQUFDO1FBRUQsNkZBQTZGO1FBQzdGLG1CQUFtQixDQUFDLE1BQU0sQ0FDekIsUUFBUSxDQUFDLElBQUksRUFDYixRQUFRLENBQ1AsZ0VBQWdFLEVBQ2hFLHlHQUF5RyxDQUN6RyxFQUNEO1lBQ0M7Z0JBQ0MsS0FBSyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLENBQUM7Z0JBQy9DLEdBQUcsRUFBRSxHQUFHLEVBQUU7b0JBQ1QsY0FBYyxDQUFDLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQzt5QkFDdEQsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7d0JBQ2hCLFVBQVUsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLHlCQUF5QixjQUFjLEtBQUssR0FBRyxDQUFDLENBQUM7b0JBQ3JGLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7YUFDRDtZQUNEO2dCQUNDLEtBQUssRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsWUFBWSxDQUFDO2dCQUN0RCxHQUFHLEVBQUUsR0FBRyxFQUFFO29CQUNULGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNFLENBQUM7YUFDRDtTQUNELEVBQ0Q7WUFDQyxjQUFjLEVBQUU7Z0JBQ2YsRUFBRSxFQUFFLGdFQUFnRTtnQkFDcEUsS0FBSyxFQUFFLG1CQUFtQixDQUFDLE9BQU87YUFDbEM7U0FDRCxDQUNELENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxTQUFTLHdCQUF3QixDQUFDLFVBQXVCLEVBQUUsSUFBd0IsRUFBRSxNQUFjO0lBQ2xHLFFBQVEsVUFBVSxFQUFFLENBQUM7UUFDcEIsS0FBSyxXQUFXLENBQUMsTUFBTTtZQUN0QixPQUFPO2dCQUNOLEtBQUs7Z0JBQ0wsU0FBUyxJQUFJLElBQUksa0JBQWtCLEVBQUU7Z0JBQ3JDLHFEQUFxRDtnQkFDckQsS0FBSztnQkFDTCxFQUFFO2dCQUNGLG9GQUFvRjtnQkFDcEYsRUFBRTtnQkFDRiwrSUFBK0k7YUFDL0ksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDZCxLQUFLLFdBQVcsQ0FBQyxZQUFZO1lBQzVCLElBQUksTUFBTSxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDOUIsT0FBTztvQkFDTixLQUFLO29CQUNMLHNFQUFzRTtvQkFDdEUsUUFBUTtvQkFDUixtQkFBbUI7b0JBQ25CLEtBQUs7b0JBQ0wsRUFBRTtvQkFDRiwwRkFBMEY7b0JBQzFGLEVBQUU7b0JBQ0Ysd0hBQXdIO2lCQUN4SCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNkLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPO29CQUNOLEtBQUs7b0JBQ0wseUdBQXlHO29CQUN6RywySkFBMko7b0JBQzNKLEtBQUs7b0JBQ0wsRUFBRTtvQkFDRiwwRkFBMEY7b0JBQzFGLEVBQUU7b0JBQ0YsNElBQTRJO2lCQUM1SSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNkLENBQUM7UUFDRixLQUFLLFdBQVcsQ0FBQyxLQUFLO1lBQ3JCLElBQUksTUFBTSxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDOUIsT0FBTztvQkFDTixLQUFLO29CQUNMLFNBQVMsSUFBSSxJQUFJLGlCQUFpQixFQUFFO29CQUNwQyw2RUFBNkU7b0JBQzdFLGtIQUFrSDtvQkFDbEgsS0FBSztvQkFDTCxFQUFFO29CQUNGLG1GQUFtRjtvQkFDbkYsRUFBRTtvQkFDRixrSUFBa0k7aUJBQ2xJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2QsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU87b0JBQ04sS0FBSztvQkFDTCxTQUFTLElBQUksSUFBSSxpQkFBaUIsRUFBRTtvQkFDcEMsNkVBQTZFO29CQUM3RSw0R0FBNEc7b0JBQzVHLHFLQUFxSztvQkFDckssS0FBSztvQkFDTCxFQUFFO29CQUNGLG1GQUFtRjtvQkFDbkYsRUFBRTtvQkFDRixrSUFBa0k7aUJBQ2xJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2QsQ0FBQztRQUNGLEtBQUssV0FBVyxDQUFDLEtBQUs7WUFDckIsT0FBTztnQkFDTixLQUFLO2dCQUNMLFNBQVMsSUFBSSxJQUFJLGlCQUFpQixFQUFFO2dCQUNwQyxpSUFBaUk7Z0JBQ2pJLEtBQUs7Z0JBQ0wsRUFBRTtnQkFDRixtRkFBbUY7Z0JBQ25GLEVBQUU7Z0JBQ0YscUdBQXFHO2FBQ3JHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2Q7WUFDQyxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7QUFDRixDQUFDO0FBSUQsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsOEJBQThCLENBQUM7QUFDcEUsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsb0NBQW9DLENBQUM7QUFDaEYsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsNkJBQTZCLENBQUM7QUFDbEUsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsNkJBQTZCLENBQUM7QUFFbEUsTUFBTSxtQkFBb0IsU0FBUSwyQkFBMkI7SUFDNUQ7UUFDQyxLQUFLLENBQUMscUJBQXFCLEVBQUUsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3JILENBQUM7Q0FDRDtBQUVELE1BQU0seUJBQTBCLFNBQVEsMkJBQTJCO0lBQ2xFO1FBQ0MsS0FBSyxDQUFDLDJCQUEyQixFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSwwQkFBMEIsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUM3SSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGtCQUFtQixTQUFRLDJCQUEyQjtJQUMzRDtRQUNDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUscUJBQXFCLENBQUMsRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbkgsQ0FBQztDQUNEO0FBRUQsTUFBTSxrQkFBbUIsU0FBUSxPQUFPO0lBQ3ZDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLG9CQUFvQjtZQUN4QixLQUFLLEVBQUUsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLG1CQUFtQixDQUFDO1lBQ3RFLEVBQUUsRUFBRSxLQUFLO1lBQ1QsWUFBWSxFQUFFLGVBQWUsQ0FBQyxPQUFPO1lBQ3JDLFFBQVEsRUFBRSxhQUFhO1lBQ3ZCLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQzthQUN6QztZQUNELElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7Z0JBQ3pCLElBQUksRUFBRSxlQUFlLENBQUMsT0FBTzthQUM3QjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFZSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsT0FBMkI7UUFDaEYsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNuRCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDL0MsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3pELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNELElBQUksU0FBYyxDQUFDO1FBQ25CLElBQUksT0FBTyxFQUFFLFlBQVksRUFBRSxDQUFDO1lBQzNCLFNBQVMsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDO1FBQ2xDLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxjQUFjLEdBQUcsTUFBTSxZQUFZLENBQUMsY0FBYyxDQUFDLHdCQUF3QixFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0RyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3JCLE9BQU87WUFDUixDQUFDO1lBQ0QsU0FBUyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUM7UUFDaEMsQ0FBQztRQUVELCtDQUErQztRQUMvQywrRkFBK0Y7UUFDL0YsOEVBQThFO1FBQzlFLE1BQU0sU0FBUyxHQUFHLE1BQU0saUJBQWlCLENBQUMsS0FBSyxDQUFDO1lBQy9DLE1BQU0sRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsMkVBQTJFLENBQUM7WUFDL0gsV0FBVyxFQUFFLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxxQ0FBcUMsQ0FBQztZQUNuRyxhQUFhLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUM5QixJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7b0JBQzdCLE9BQU8sUUFBUSxDQUFDLGtDQUFrQyxFQUFFLHdCQUF3QixDQUFDLENBQUM7Z0JBQy9FLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMxQixJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFLENBQUM7b0JBQ3RCLE9BQU8sUUFBUSxDQUFDLGlDQUFpQyxFQUFFLDBDQUEwQyxDQUFDLENBQUM7Z0JBQ2hHLENBQUM7Z0JBQ0Qsb0RBQW9EO2dCQUNwRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3hDLE9BQU8sUUFBUSxDQUFDLHNDQUFzQyxFQUFFLHFFQUFxRSxDQUFDLENBQUM7Z0JBQ2hJLENBQUM7Z0JBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDaEQsT0FBTyxRQUFRLENBQUMsb0NBQW9DLEVBQUUsZ0RBQWdELENBQUMsQ0FBQztnQkFDekcsQ0FBQztnQkFDRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDekIsT0FBTyxRQUFRLENBQUMsNENBQTRDLEVBQUUsaURBQWlELENBQUMsQ0FBQztnQkFDbEgsQ0FBQztnQkFDRCxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXJDLDRDQUE0QztRQUM1QyxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6RCxNQUFNLFdBQVcsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFNUMsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDL0QsTUFBTSxXQUFXLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRTNDLElBQUksTUFBc0MsQ0FBQztRQUMzQyxJQUFJLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQztZQUN2QixNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQy9DLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxhQUFhLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sR0FBRyxhQUFhLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ2pGLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDdEMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsRUFBRTtvQkFDNUMsUUFBUSxFQUFFLHdCQUF3QixDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUM7aUJBQ3BGLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sMkJBQTRCLFNBQVEsT0FBTztJQUNoRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSx1Q0FBdUM7WUFDM0MsS0FBSyxFQUFFLFNBQVMsQ0FBQyxvQ0FBb0MsRUFBRSwwQkFBMEIsQ0FBQztZQUNsRixFQUFFLEVBQUUsSUFBSTtZQUNSLFlBQVksRUFBRSxlQUFlLENBQUMsT0FBTztZQUNyQyxRQUFRLEVBQUUsYUFBYTtZQUN2QixVQUFVLEVBQUU7Z0JBQ1gsTUFBTSw2Q0FBbUM7YUFDekM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRWUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuRCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRW5ELE1BQU0sVUFBVSxHQUFHLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVuRSxNQUFNLEtBQUssR0FBRyxNQUFNLGFBQWEsQ0FBQyxVQUFVLENBQUM7WUFDNUMsUUFBUSxFQUFFLFNBQVM7WUFDbkIsVUFBVTtZQUNWLE9BQU8sRUFBRTtnQkFDUixNQUFNLEVBQUUsSUFBSTthQUNaO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztRQUVoQyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDcEUsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDakMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUN0QyxLQUFLLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLGlCQUFpQixFQUFFO29CQUM1QyxRQUFRLEVBQUUsd0JBQXdCLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDO2lCQUNyRSxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRDtBQUVELE1BQU0sVUFBVSw0QkFBNEI7SUFDM0MsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDckMsZUFBZSxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDM0MsZUFBZSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDcEMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDcEMsZUFBZSxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFDOUMsQ0FBQyJ9