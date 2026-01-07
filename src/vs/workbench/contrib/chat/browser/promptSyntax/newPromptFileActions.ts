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
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CONFIGURE_SYNC_COMMAND_ID } from '../../../../services/userDataSync/common/userDataSync.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { askForPromptFileName } from './pickers/askForPromptName.js';
import { askForPromptSourceFolder } from './pickers/askForPromptSourceFolder.js';
import { IChatModeService } from '../../common/chatModes.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { isValidBasename } from '../../../../../base/common/extpath.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';


class AbstractNewPromptFileAction extends Action2 {

	constructor(id: string, title: string, private readonly type: PromptsType) {
		super({
			id,
			title,
			f1: false,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette,
				when: ChatContextKeys.enabled
			}
		});
	}

	public override async run(accessor: ServicesAccessor) {
		const logService = accessor.get(ILogService);
		const openerService = accessor.get(IOpenerService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);
		const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const instaService = accessor.get(IInstantiationService);
		const chatModeService = accessor.get(IChatModeService);

		const selectedFolder = await instaService.invokeFunction(askForPromptSourceFolder, this.type);
		if (!selectedFolder) {
			return;
		}

		const fileName = await instaService.invokeFunction(askForPromptFileName, this.type, selectedFolder.uri);
		if (!fileName) {
			return;
		}

		// create the prompt file

		await fileService.createFolder(selectedFolder.uri);

		const promptUri = URI.joinPath(selectedFolder.uri, fileName);
		await fileService.createFile(promptUri);

		await openerService.open(promptUri);

		const editor = getCodeEditor(editorService.activeTextEditorControl);
		if (editor && editor.hasModel() && isEqual(editor.getModel().uri, promptUri)) {
			SnippetController2.get(editor)?.apply([{
				range: editor.getModel().getFullModelRange(),
				template: getDefaultContentSnippet(this.type, chatModeService),
			}]);
		}

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
				"Do you want to backup and sync your user prompt, instruction and custom agent files with Setting Sync?'",
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
				},
				{
					label: localize('learnMore.capitalized', "Learn More"),
					run: () => {
						openerService.open(URI.parse('https://aka.ms/vscode-settings-sync-help'));
					},
				},
			],
			{
				neverShowAgain: {
					id: 'workbench.command.prompts.create.user.enable-sync-notification',
					scope: NeverShowAgainScope.PROFILE,
				},
			},
		);
	}
}

function getDefaultContentSnippet(promptType: PromptsType, chatModeService: IChatModeService): string {
	const agents = chatModeService.getModes();
	const agentNames = agents.builtin.map(agent => agent.name.get()).join(',') + (agents.custom.length ? (',' + agents.custom.map(agent => agent.name.get()).join(',')) : '');
	switch (promptType) {
		case PromptsType.prompt:
			return [
				`---`,
				`agent: \${1|${agentNames}|}`,
				`---`,
				`\${2:Define the task to achieve, including specific requirements, constraints, and success criteria.}`,
			].join('\n');
		case PromptsType.instructions:
			return [
				`---`,
				`applyTo: '\${1|**,**/*.ts|}'`,
				`---`,
				`\${2:Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.}`,
			].join('\n');
		case PromptsType.agent:
			return [
				`---`,
				`description: '\${1:Describe what this custom agent does and when to use it.}'`,
				`tools: []`,
				`---`,
				`\${2:Define what this custom agent accomplishes for the user, when to use it, and the edges it won't cross. Specify its ideal inputs/outputs, the tools it may call, and how it reports progress or asks for help.}`,
			].join('\n');
		default:
			throw new Error(`Unknown prompt type: ${promptType}`);
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

class NewSkillAction extends Action2 {
	constructor() {
		super({
			id: NEW_SKILL_COMMAND_ID,
			title: localize2('commands.new.skill.local.title', "New Skill..."),
			f1: false,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette,
				when: ChatContextKeys.enabled
			}
		});
	}

	public override async run(accessor: ServicesAccessor) {
		const logService = accessor.get(ILogService);
		const openerService = accessor.get(IOpenerService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);
		const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const userDataProfileService = accessor.get(IUserDataProfileService);

		// Skills can be created in either .github/skills or .claude/skills
		// Ask the user to select which one
		const skillLocations: Array<{ label: string; path: string; description: string; isUser?: boolean }> = [];

		const { folders } = workspaceContextService.getWorkspace();
		if (folders.length > 0) {
			skillLocations.push({
				label: localize('skill.location.github', ".github/skills"),
				path: '.github/skills',
				description: localize('skill.location.github.desc', "Workspace")
			});

		}

		// Add user home locations
		skillLocations.push({
			label: localize('skill.location.copilot.user', "~/.copilot/skills"),
			path: '.copilot/skills',
			description: localize('skill.location.copilot.user.desc', "User Home"),
			isUser: true
		});

		const selectedLocation = await quickInputService.pick(skillLocations, {
			placeHolder: localize('skill.location.placeholder', "Select a location to create the skill"),
			canPickMany: false
		});

		if (!selectedLocation) {
			return;
		}

		// Ask for the skill folder name (not the file name, since we'll create SKILL.md inside)
		const skillFolderName = await quickInputService.input({
			placeHolder: localize('skill.folder.placeholder', "Enter the skill folder name (e.g., 'my-skill')"),
			validateInput: async (value) => {
				const trimmed = value.trim();
				if (!trimmed) {
					return localize('skill.folder.empty', "Please enter a name.");
				}
				if (!isValidBasename(trimmed)) {
					return localize('skill.folder.invalid', "The name contains invalid characters.");
				}
				return undefined;
			}
		});

		if (!skillFolderName) {
			return;
		}

		const trimmedFolderName = skillFolderName.trim();

		// Determine the base URI for the skill folder
		let baseUri: URI;
		if (selectedLocation.isUser) {
			const homeDir = userDataProfileService.currentProfile.location;
			baseUri = URI.joinPath(homeDir, selectedLocation.path);
		} else {
			const firstFolder = folders[0];
			baseUri = URI.joinPath(firstFolder.uri, selectedLocation.path);
		}

		// Create the skill folder
		const skillFolderUri = URI.joinPath(baseUri, trimmedFolderName);
		await fileService.createFolder(skillFolderUri);

		// Create the SKILL.md file inside the folder
		const skillFileUri = URI.joinPath(skillFolderUri, 'SKILL.md');
		await fileService.createFile(skillFileUri);

		// Open the file
		await openerService.open(skillFileUri);

		// Insert template content
		const editor = getCodeEditor(editorService.activeTextEditorControl);
		if (editor && editor.hasModel() && isEqual(editor.getModel().uri, skillFileUri)) {
			SnippetController2.get(editor)?.apply([{
				range: editor.getModel().getFullModelRange(),
				template: [
					`---`,
					`name: "\${1:${trimmedFolderName}}"`,
					`description: "\${2:Describe what this skill does and when to use it.}"`,
					`---`,
					`\${3:Provide detailed instructions for this skill, including specific knowledge, procedures, or guidelines that Claude should follow when this skill is loaded.}`,
				].join('\n'),
			}]);
		}

		// Show sync notification if created in user location
		if (selectedLocation.isUser) {
			const isConfigured = userDataSyncEnablementService
				.isResourceEnablementConfigured(SyncResource.Prompts);
			const isSettingsSyncEnabled = userDataSyncEnablementService.isEnabled();

			if ((isConfigured === true) || (isSettingsSyncEnabled === false)) {
				return;
			}

			notificationService.prompt(
				Severity.Info,
				localize(
					'workbench.command.skill.create.user.enable-sync-notification',
					"Do you want to backup and sync your user skill files with Setting Sync?'",
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
					},
					{
						label: localize('learnMore.capitalized', "Learn More"),
						run: () => {
							openerService.open(URI.parse('https://aka.ms/vscode-settings-sync-help'));
						},
					},
				],
				{
					neverShowAgain: {
						id: 'workbench.command.skill.create.user.enable-sync-notification',
						scope: NeverShowAgainScope.PROFILE,
					},
				},
			);
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
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	public override async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const chatModeService = accessor.get(IChatModeService);

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
				template: getDefaultContentSnippet(type, chatModeService),
			}]);
		}

		return input;
	}
}

export function registerNewPromptFileActions(): void {
	registerAction2(NewPromptFileAction);
	registerAction2(NewInstructionsFileAction);
	registerAction2(NewAgentFileAction);
	registerAction2(NewSkillAction);
	registerAction2(NewUntitledPromptFileAction);
}
