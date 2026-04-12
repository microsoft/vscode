/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { IChatWidgetService } from '../chat.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatModeKind } from '../../common/constants.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { getPromptFileDefaultLocations } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../../nls.js';
import { ICustomizationHarnessService, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
/**
 * Service that opens an AI-guided chat session to help the user create
 * a new customization (agent, skill, instructions, prompt, hook).
 *
 * Opens a new chat in agent mode, then sends a request with hidden
 * system instructions (modeInstructions) that guide the AI through
 * the creation process. The user sees only their message.
 */
let CustomizationCreatorService = class CustomizationCreatorService {
    constructor(commandService, chatService, chatWidgetService, workspaceService, promptsService, quickInputService, harnessService) {
        this.commandService = commandService;
        this.chatService = chatService;
        this.chatWidgetService = chatWidgetService;
        this.workspaceService = workspaceService;
        this.promptsService = promptsService;
        this.quickInputService = quickInputService;
        this.harnessService = harnessService;
    }
    async createWithAI(type) {
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
        // to the active workspace. For this to fully work, the background agent needs to
        // accept a workspace parameter so the new session can write files into the correct
        // directory and have those changes tracked.
        // Capture project root BEFORE opening new chat (which may change active session)
        const targetDir = await this.resolveTargetDirectoryWithPicker(type);
        if (targetDir === null) {
            return; // User cancelled the picker
        }
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
     * Resolves the workspace directory for a new customization file based on the
     * active project root.
     */
    resolveTargetDirectory(type) {
        return resolveWorkspaceTargetDirectory(this.workspaceService, type);
    }
    /**
     * Resolves the workspace directory for a new customization file.
     * If multiple local source folders exist, shows a picker to let the user choose.
     *
     * @returns the resolved URI, `undefined` when no folder is available,
     *          or `null` when the user cancelled the picker.
     */
    async resolveTargetDirectoryWithPicker(type) {
        const allFolders = await this.promptsService.getSourceFolders(type);
        const projectRoot = this.workspaceService.getActiveProjectRoot();
        const descriptor = this.harnessService.getActiveDescriptor();
        const subpaths = descriptor.workspaceSubpaths;
        // Filter to only workspace-scoped folders (under the active project root).
        // Don't rely on storage tags — tilde-expanded user paths can be tagged local.
        // Deduplicate by URI to avoid inflated counts and duplicate picker entries.
        // When the active harness specifies workspaceSubpaths, further restrict to
        // directories whose path includes one of those sub-paths (e.g. `.claude`).
        const seen = new Set();
        const workspaceFolders = projectRoot
            ? allFolders.filter(f => {
                if (!isEqualOrParent(f.uri, projectRoot)) {
                    return false;
                }
                const key = f.uri.toString();
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                if (subpaths) {
                    return matchesWorkspaceSubpath(f.uri.path, subpaths);
                }
                return true;
            })
            : [];
        if (workspaceFolders.length === 0) {
            // No workspace folders — fall back to the existing resolution logic
            return this.resolveTargetDirectory(type);
        }
        if (workspaceFolders.length === 1) {
            return workspaceFolders[0].uri;
        }
        // Multiple directories — ask the user which one to use
        const items = workspaceFolders.map(folder => ({
            label: this.promptsService.getPromptLocationLabel(folder),
            description: folder.uri.fsPath,
            uri: folder.uri,
        }));
        const picked = await this.quickInputService.pick(items, {
            placeHolder: localize('selectTargetDirectory', "Select a directory for the new customization file"),
        });
        return picked?.uri ?? null;
    }
    /**
     * Resolves the user-level directory for a new customization file.
     */
    async resolveUserDirectory(type) {
        return resolveUserTargetDirectory(this.promptsService, type);
    }
};
CustomizationCreatorService = __decorate([
    __param(0, ICommandService),
    __param(1, IChatService),
    __param(2, IChatWidgetService),
    __param(3, IAICustomizationWorkspaceService),
    __param(4, IPromptsService),
    __param(5, IQuickInputService),
    __param(6, ICustomizationHarnessService)
], CustomizationCreatorService);
export { CustomizationCreatorService };
/**
 * Resolves the workspace directory for a new customization file based on the active project root.
 */
export function resolveWorkspaceTargetDirectory(workspaceService, type) {
    const basePath = workspaceService.getActiveProjectRoot();
    if (!basePath) {
        return undefined;
    }
    const defaultLocations = getPromptFileDefaultLocations(type);
    const localLocation = defaultLocations.find(loc => loc.storage === PromptsStorage.local);
    if (!localLocation) {
        return basePath;
    }
    return URI.joinPath(basePath, localLocation.path);
}
/**
 * Resolves the user-level directory for a new customization file.
 * Delegates to IPromptsService.getSourceFolders() which returns the appropriate
 * user root (VS Code profile in core, ~/.copilot in sessions).
 */
export async function resolveUserTargetDirectory(promptsService, type) {
    const folders = await promptsService.getSourceFolders(type);
    const userFolder = folders.find(f => f.storage === PromptsStorage.user);
    return userFolder?.uri;
}
//#region Agent Instructions
/**
 * Builds the hidden system instructions for the customization creator agent.
 * Sent as modeInstructions - invisible to the user.
 */
function buildAgentInstructions(type, targetDir, name) {
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
function buildUserMessage(type, targetDir, name) {
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
function getTypeLabel(type) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkNyZWF0b3JTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9jdXN0b21pemF0aW9uQ3JlYXRvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ2hELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDekQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXBIOzs7Ozs7O0dBT0c7QUFDSSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUEyQjtJQUV2QyxZQUNt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