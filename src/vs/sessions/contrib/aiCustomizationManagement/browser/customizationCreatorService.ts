/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { getPromptFileDefaultLocations } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../nls.js';
import { getActiveSessionRoot } from './aiCustomizationManagement.js';

/**
 * Service that opens an AI-guided chat session to help the user create
 * a new customization (agent, skill, instructions, prompt, hook).
 *
 * Opens a new chat in agent mode, then sends a request with hidden
 * system instructions (modeInstructions) that guide the AI through
 * the creation process. The user sees only their message.
 */
export class CustomizationCreatorService {

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) { }

	async createWithAI(type: PromptsType): Promise<void> {
		// Ask for the name before entering chat
		const typeLabel = getTypeLabel(type);
		const name = await this.quickInputService.input({
			prompt: localize('generateName', "Name for the new {0}", typeLabel),
			placeHolder: localize('generateNamePlaceholder', "e.g., my-{0}", typeLabel),
			validateInput: async (value) => {
				if (!value || !value.trim()) {
					return localize('nameRequired', "Name is required");
				}
				return undefined;
			}
		});
		if (!name) {
			return;
		}
		const trimmedName = name.trim();

		// TODO: The 'Generate X' flow currently opens a new chat that is not connected
		// to the active worktree. For this to fully work, the background agent needs to
		// accept a worktree parameter so the new session can write files into the correct
		// worktree directory and have those changes tracked in the session's diff view.

		// Capture worktree BEFORE opening new chat (which changes active session)
		const targetDir = this.resolveTargetDirectory(type);
		const systemInstructions = buildAgentInstructions(type, targetDir, trimmedName);
		const userMessage = buildUserMessage(type, targetDir, trimmedName);

		// Start a new chat, then send the request with hidden instructions
		await this.commandService.executeCommand('workbench.action.chat.newChat');

		// Grab the now-active widget's session and send with hidden instructions
		const widget = this.chatWidgetService.lastFocusedWidget;
		const sessionResource = widget?.viewModel?.sessionResource;
		if (!sessionResource) {
			return;
		}

		await this.chatService.sendRequest(sessionResource, userMessage, {
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: false,
				modeId: 'custom',
				applyCodeBlockSuggestionId: undefined,
				modeInstructions: {
					name: 'customization-creator',
					content: systemInstructions,
					toolReferences: [],
				},
			},
		});
	}

	/**
	 * Returns the worktree and repository URIs from the active session.
	 */
	/**
	 * Resolves the worktree directory for a new customization file based on the
	 * active session's worktree (preferred) or repository path.
	 * Falls back to the first local source folder from promptsService.getSourceFolders()
	 * if there's no active worktree.
	 */
	resolveTargetDirectory(type: PromptsType): URI | undefined {
		const basePath = getActiveSessionRoot(this.activeSessionService);
		if (!basePath) {
			return undefined;
		}

		// Compute the path within the worktree using default locations
		const defaultLocations = getPromptFileDefaultLocations(type);
		const localLocation = defaultLocations.find(loc => loc.storage === PromptsStorage.local);
		if (!localLocation) {
			return basePath;
		}

		return URI.joinPath(basePath, localLocation.path);
	}

	/**
	 * Resolves the user-level directory for a new customization file.
	 * Delegates to IPromptsService.getSourceFolders() which knows the correct
	 * user data profile path.
	 */
	async resolveUserDirectory(type: PromptsType): Promise<URI | undefined> {
		const folders = await this.promptsService.getSourceFolders(type);
		const userFolder = folders.find(f => f.storage === PromptsStorage.user);
		return userFolder?.uri;
	}
}

//#region Agent Instructions

/**
 * Builds the hidden system instructions for the customization creator agent.
 * Sent as modeInstructions - invisible to the user.
 */
function buildAgentInstructions(type: PromptsType, targetDir: URI | undefined, name: string): string {
	const targetHint = targetDir
		? `\nIMPORTANT: Save the file to this directory: ${targetDir.fsPath}. The name is "${name}".`
		: `\nThe name is "${name}".`;

	const writePolicy = `

CRITICAL WORKFLOW:
- In your VERY FIRST response, you MUST immediately create the file on disk from a starter template with placeholder content. Do not ask questions first -- write the file first so it appears in the diff view, then ask the user how they want to customize it.
- Every subsequent message from the user should result in you updating that same file on disk with the requested changes.
- Always write the complete file content, not partial diffs.${targetHint}`;

	switch (type) {
		case PromptsType.agent:
			return `You are a helpful assistant that guides users through creating a new custom AI agent.${writePolicy}

Create a file named "${name}.agent.md" with YAML frontmatter (name, description, tools) and system instructions. Ask the user what it should do.`;

		case PromptsType.skill:
			return `You are a helpful assistant that guides users through creating a new skill.${writePolicy}

Create a directory named "${name}" with a SKILL.md file inside it. The file should have YAML frontmatter (name, description) and instructions. Ask the user what it does.`;

		case PromptsType.instructions:
			return `You are a helpful assistant that guides users through creating a new instructions file.${writePolicy}

Create a file named "${name}.instructions.md" with YAML frontmatter (description, optional applyTo) and actionable content. Ask the user what it should cover.`;

		case PromptsType.prompt:
			return `You are a helpful assistant that guides users through creating a new reusable prompt.${writePolicy}

Create a file named "${name}.prompt.md" with YAML frontmatter (name, description) and prompt content. Ask the user what it should do.`;

		case PromptsType.hook:
			return `You are a helpful assistant that guides users through creating a new hook.${writePolicy}

Ask the user when the hook should trigger and what it should do, then write the configuration file.`;

		default:
			return `You are a helpful assistant that guides users through creating a new AI customization file.${writePolicy}

Ask the user what they want to create, then guide them step by step.`;
	}
}

//#endregion

//#region User Messages

/**
 * Builds the user-visible message that opens the chat.
 * Includes the target path so the agent knows where to write the file.
 */
function buildUserMessage(type: PromptsType, targetDir: URI | undefined, name: string): string {
	const pathHint = targetDir ? ` Write it to \`${targetDir.fsPath}\`.` : '';

	switch (type) {
		case PromptsType.agent:
			return `Help me create a new custom agent called "${name}".${pathHint}`;
		case PromptsType.skill:
			return `Help me create a new skill called "${name}".${pathHint}`;
		case PromptsType.instructions:
			return `Help me create new instructions called "${name}".${pathHint}`;
		case PromptsType.prompt:
			return `Help me create a new prompt called "${name}".${pathHint}`;
		case PromptsType.hook:
			return `Help me create a new hook called "${name}".${pathHint}`;
		default:
			return `Help me create a new customization called "${name}".${pathHint}`;
	}
}

function getTypeLabel(type: PromptsType): string {
	switch (type) {
		case PromptsType.agent: return 'agent';
		case PromptsType.skill: return 'skill';
		case PromptsType.instructions: return 'instructions';
		case PromptsType.prompt: return 'prompt';
		case PromptsType.hook: return 'hook';
		default: return 'customization';
	}
}

//#endregion
