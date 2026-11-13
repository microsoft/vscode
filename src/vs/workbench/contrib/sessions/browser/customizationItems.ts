/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ExtensionsLocalizedLabel } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ILanguageModelToolsService } from '../../chat/common/tools/languageModelToolsService.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from '../../chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { getCustomizationToolSets } from '../../chat/browser/agentSessions/agentHost/copilotCliBuiltinToolSet.js';
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from '../../chat/browser/aiCustomization/aiCustomizationIcons.js';
import { extensionsViewIcon } from '../../extensions/browser/extensionsIcons.js';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from '../../extensions/common/extensions.js';
import { getEnabledViewContainerContextKey } from '../../../common/contextkeys.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT } from '../../../../platform/extensions/common/extensions.js';
import { IReader } from '../../../../base/common/observable.js';
import { AICustomizationManagementSection } from '../../chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../chat/common/customizationHarnessService.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IAICustomizationMcpServerCountService } from './customizationMcpServerCount.js';

export interface ICustomizationItemConfig {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly section?: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];
	/** If set, count comes from `IAICustomizationItemsModel.getCount(modelSection)`. */
	readonly modelSection?: ItemsModelSection;
	readonly isMcp?: boolean;
	readonly isPlugins?: boolean;
	readonly isTools?: boolean;
	/** Additional `when` clause beyond the standard harness-visibility gate. */
	readonly when?: ContextKeyExpression;
	/** If set, the Command Palette also offers the item, with this title and category, and its default keybinding, if any. */
	readonly command?: {
		readonly title: ILocalizedString;
		readonly category: ILocalizedString;
		readonly keybinding?: number;
		/**
		 * If set, a context key, kept in sync with where the sidebar offers the item, that scopes the default keybinding.
		 * Lets the keybindings that users assign a command with the same ID in editor windows, which the Keyboard
		 * Shortcuts editor scopes to that command's context key, apply to the item's command too.
		 */
		readonly enablementContextKey?: string;
	};
}

export function readCustomizationCount(
	config: ICustomizationItemConfig,
	reader: IReader,
	itemsModel: IAICustomizationItemsModel,
	mcpServerCountService: IAICustomizationMcpServerCountService,
	toolsService: ILanguageModelToolsService,
	toolEnablementService: IAgentHostToolSetEnablementService,
): number {
	if (config.modelSection) {
		return itemsModel.getCount(config.modelSection).read(reader);
	}
	if (config.isMcp) {
		return mcpServerCountService.count.read(reader);
	}
	if (config.isPlugins) {
		return itemsModel.getPluginCount().read(reader);
	}
	if (config.isTools) {
		const state = toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
		return countEnabledCustomizationTools(getCustomizationToolSets(toolsService.toolSets.read(reader)), state, reader);
	}
	return 0;
}

export function readTotalCustomizationCount(
	reader: IReader,
	itemsModel: IAICustomizationItemsModel,
	mcpServerCountService: IAICustomizationMcpServerCountService,
	toolsService: ILanguageModelToolsService,
	toolEnablementService: IAgentHostToolSetEnablementService,
	harnessService: ICustomizationHarnessService,
): number {
	harnessService.activeHarness.read(reader);
	harnessService.availableHarnesses.read(reader);
	const hiddenSections = new Set(harnessService.getActiveDescriptor().hiddenSections ?? []);
	let total = 0;
	for (const config of CUSTOMIZATION_ITEMS) {
		if (config.section && hiddenSections.has(config.section)) {
			continue;
		}
		total += readCustomizationCount(config, reader, itemsModel, mcpServerCountService, toolsService, toolEnablementService);
	}
	return total;
}

export const CUSTOMIZATION_ITEMS: ICustomizationItemConfig[] = [
	{
		id: 'sessions.customization.plugins',
		label: localize('plugins', "Plugins"),
		icon: pluginIcon,
		section: AICustomizationManagementSection.Plugins,
		isPlugins: true,
	},
	{
		id: 'sessions.customization.canvases',
		label: localize('canvases', "Canvases"),
		icon: Codicon.preview,
		section: AICustomizationManagementSection.Canvases,
		when: ContextKeyExpr.and(
			IsWebContext.negate(),
			ContextKeyExpr.equals(`config.${CanvasesEnabledSettingId}`, true),
		),
	},
	{
		id: 'sessions.customization.mcpServers',
		label: localize('mcpServers', "MCP Servers"),
		icon: mcpServerIcon,
		section: AICustomizationManagementSection.McpServers,
		isMcp: true,
	},
	{
		id: 'sessions.customization.skills',
		label: localize('skills', "Skills"),
		icon: skillIcon,
		section: AICustomizationManagementSection.Skills,
		modelSection: AICustomizationManagementSection.Skills,
	},
	{
		id: 'sessions.customization.instructions',
		label: localize('instructions', "Instructions"),
		icon: instructionsIcon,
		section: AICustomizationManagementSection.Instructions,
		modelSection: AICustomizationManagementSection.Instructions,
	},
	{
		id: 'sessions.customization.agents',
		label: localize('agents', "Agents"),
		icon: agentIcon,
		section: AICustomizationManagementSection.Agents,
		modelSection: AICustomizationManagementSection.Agents,
	},
	{
		id: 'sessions.customization.hooks',
		label: localize('hooks', "Hooks"),
		icon: hookIcon,
		section: AICustomizationManagementSection.Hooks,
		modelSection: AICustomizationManagementSection.Hooks,
	},
	{
		id: 'sessions.customization.tools',
		label: localize('tools', "Tools"),
		icon: toolsIcon,
		section: AICustomizationManagementSection.Tools,
		isTools: true,
	},
	{
		// The ID of Show Extensions in editor windows, so the keybindings that users assign it there apply in the Agents window too.
		id: EXTENSIONS_VIEWLET_ID,
		label: localize('extensions', "Extensions"),
		icon: extensionsViewIcon,
		section: AICustomizationManagementSection.Extensions,
		when: ContextKeyExpr.equals(`config.${EXTENSIONS_AGENTS_WINDOW_MANAGEMENT}`, true),
		command: {
			title: localize2('manageExtensions', "Manage Extensions..."),
			category: ExtensionsLocalizedLabel,
			// Like the Extensions view in editor windows.
			keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX,
			enablementContextKey: getEnabledViewContainerContextKey(EXTENSIONS_VIEWLET_ID),
		},
	},
	{
		id: 'sessions.customization.harnessSettings',
		label: localize('harnessSettings', "Codex"),
		icon: Codicon.openai,
		section: AICustomizationManagementSection.HarnessSettings,
	},
];
