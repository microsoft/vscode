/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { aiCustomizationManagementSectionRegistry } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { extensionsViewIcon } from '../../../../workbench/contrib/extensions/browser/extensionsIcons.js';
import { AgentsWindowExtensionAutoEnablementTelemetry } from './agentsWindowExtensionAutoEnablementTelemetry.js';
import { AgentsWindowExtensionsAccessibilityHelp } from './agentsWindowExtensionsAccessibilityHelp.js';
import { AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING, AgentsWindowExtensionSuggestionsService, getExtensionSuggestionsBadgeDescription, IAgentsWindowExtensionSuggestionsService } from './agentsWindowExtensionSuggestions.js';
import { AgentsWindowExtensionsWidget } from './agentsWindowExtensionsWidget.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'extensions',
	properties: {
		[EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			description: localize('extensions.experimental.enableAgentsWindowCapability', "When enabled, non-built-in extensions can declare whether they support running in the Agents window. Built-in extensions can declare support without enabling this setting."),
			default: true,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			agentsWindow: { default: true }
		},
		[EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			description: localize('extensions.experimental.agentsWindowManagement', "When enabled, you can choose which installed extensions run in the Agents window from the Extensions section of Agent Customizations. When disabled, extensions that don't support the Agents window stay disabled there, and your previous choices are kept but ignored."),
			default: product.quality !== 'stable',
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('extensions.experimental.agentsWindowSuggestions', "When enabled, the Agents window suggests installed extensions that add AI features, such as tools, MCP servers, or skills. The Extensions section of Agent Customizations lists them in an AI Features group, and its entry point shows a badge while they are disabled, until you open the section. Requires `#{0}#`.", EXTENSIONS_AGENTS_WINDOW_MANAGEMENT),
			default: product.quality !== 'stable',
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('extensions.experimental.agentsWindowAutoEnable', "When enabled, installed extensions that haven't declared support for the Agents window are enabled there automatically when they add AI features, such as tools, MCP servers, or skills, and don't rely on views, debugging, or other features that are unavailable in the Agents window. You can still disable them from the Extensions section of Agent Customizations. Requires `#{0}#`.", EXTENSIONS_AGENTS_WINDOW_MANAGEMENT),
			default: false,
			tags: ['experimental'],
			// Takes effect on startup, so assignment changes do not start or stop extensions while the window is open.
			experiment: { mode: 'startup' },
		},
	},
});

registerSingleton(IAgentsWindowExtensionSuggestionsService, AgentsWindowExtensionSuggestionsService, InstantiationType.Delayed);
registerWorkbenchContribution2(AgentsWindowExtensionAutoEnablementTelemetry.ID, AgentsWindowExtensionAutoEnablementTelemetry, WorkbenchPhase.AfterRestored);

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Extensions,
	label: localize('agentsWindowExtensions.navigationLabel', "Extensions"),
	icon: extensionsViewIcon,
	description: localize('agentsWindowExtensions.navigationDescription', "Choose which installed extensions run in the Agents window."),
	enablementSettings: [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT],
	supportsHarness: () => true,
	getBadge: accessor => accessor.get(IAgentsWindowExtensionSuggestionsService).showBadge.map(show => show ? getExtensionSuggestionsBadgeDescription() : undefined),
	create: (instantiationService, container) => instantiationService.createInstance(AgentsWindowExtensionsWidget, container),
});

AccessibleViewRegistry.register(new AgentsWindowExtensionsAccessibilityHelp());
