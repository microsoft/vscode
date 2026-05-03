/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { type AICustomizationPromptsStorage, BUILTIN_STORAGE } from '../../common/aiCustomizationWorkspaceService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

/**
 * Icon for the AI Customization view container (sidebar).
 */
export const aiCustomizationViewIcon = registerIcon('ai-customization-view-icon', Codicon.sparkle, localize('aiCustomizationViewIcon', "Icon for the Agent Customization view."));

/**
 * Icon for custom agents.
 */
export const agentIcon = registerIcon('ai-customization-agent', Codicon.agent, localize('aiCustomizationAgentIcon', "Icon for custom agents."));

/**
 * Icon for skills.
 */
export const skillIcon = registerIcon('ai-customization-skill', Codicon.lightbulb, localize('aiCustomizationSkillIcon', "Icon for skills."));

/**
 * Icon for instructions.
 */
export const instructionsIcon = registerIcon('ai-customization-instructions', Codicon.book, localize('aiCustomizationInstructionsIcon', "Icon for instruction files."));

/**
 * Icon for prompts.
 */
export const promptIcon = registerIcon('ai-customization-prompt', Codicon.bookmark, localize('aiCustomizationPromptIcon', "Icon for prompt files."));

/**
 * Icon for hooks.
 */
export const hookIcon = registerIcon('ai-customization-hook', Codicon.zap, localize('aiCustomizationHookIcon', "Icon for hooks."));

/**
 * Icon for adding a new item.
 */
export const addIcon = registerIcon('ai-customization-add', Codicon.add, localize('aiCustomizationAddIcon', "Icon for adding new items."));

/**
 * Icon for the run action.
 */
export const runIcon = registerIcon('ai-customization-run', Codicon.play, localize('aiCustomizationRunIcon', "Icon for running a prompt or agent."));

/**
 * Icon for workspace storage.
 */
export const workspaceIcon = registerIcon('ai-customization-workspace', Codicon.folder, localize('aiCustomizationWorkspaceIcon', "Icon for workspace items."));

/**
 * Icon for user storage.
 */
export const userIcon = registerIcon('ai-customization-user', Codicon.account, localize('aiCustomizationUserIcon', "Icon for user items."));

/**
 * Icon for extension storage.
 */
export const extensionIcon = registerIcon('ai-customization-extension', Codicon.extensions, localize('aiCustomizationExtensionIcon', "Icon for extension-contributed items."));

/**
 * Icon for plugin storage.
 */
export const pluginIcon = registerIcon('ai-customization-plugin', Codicon.plug, localize('aiCustomizationPluginIcon', "Icon for plugin-contributed items."));

/**
 * Icon for built-in storage.
 */
export const builtinIcon = registerIcon('ai-customization-builtin', Codicon.starFull, localize('aiCustomizationBuiltinIcon', "Icon for built-in items."));

/**
 * Icon for MCP servers.
 */
export const mcpServerIcon = registerIcon('ai-customization-mcp-server', Codicon.server, localize('aiCustomizationMcpServerIcon', "Icon for MCP servers."));

/**
 * Returns the icon for a given storage type.
 */
export function storageToIcon(storage: AICustomizationPromptsStorage): ThemeIcon {
	switch (storage) {
		case PromptsStorage.local: return workspaceIcon;
		case PromptsStorage.user: return userIcon;
		case PromptsStorage.extension: return extensionIcon;
		case PromptsStorage.plugin: return pluginIcon;
		case BUILTIN_STORAGE: return builtinIcon;
		default: return instructionsIcon;
	}
}
