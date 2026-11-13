/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { EXTENSION_IDENTIFIER_PATTERN } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { aiCustomizationManagementSectionRegistry } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { extensionsViewIcon } from '../../../../workbench/contrib/extensions/browser/extensionsIcons.js';
import { AgentsWindowExtensionAutoEnablementExperiment } from './agentsWindowExtensionAutoEnablementExperiment.js';
import { AgentsWindowExtensionAutoEnablementTelemetry } from './agentsWindowExtensionAutoEnablementTelemetry.js';
import { AgentsWindowExtensionsAccessibilityHelp } from './agentsWindowExtensionsAccessibilityHelp.js';
import { AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING, AgentsWindowExtensionSuggestionsService, getExtensionSuggestionsSectionBadge, IAgentsWindowExtensionSuggestionsService } from '../../../../workbench/contrib/sessions/browser/agentsWindowExtensionSuggestions.js';
import { AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING, AGENTS_WINDOW_EXTENSIONS_BACK_COMMAND_ID, AgentsWindowExtensionPageContext, AgentsWindowExtensionsWidget } from './agentsWindowExtensionsWidget.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'extensions',
	properties: {
		[EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			description: localize('extensions.experimental.agentsWindowManagement', "When enabled, you can choose which installed extensions run in the Agents window, and install extensions from the Marketplace, from the Extensions section of Agent Customizations. When disabled, extensions that don't support the Agents window stay disabled there, and your previous choices are kept but ignored."),
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
			type: ['boolean', 'array'],
			items: {
				type: 'string',
				pattern: EXTENSION_IDENTIFIER_PATTERN,
				patternErrorMessage: localize('extensions.experimental.agentsWindowAutoEnable.patternError', "Expected an extension identifier in the format `publisher.name`."),
			},
			uniqueItems: true,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('extensions.experimental.agentsWindowAutoEnable', "Controls which installed extensions that haven't declared support for the Agents window are enabled there automatically. When `true`, extensions that add AI features, such as tools, MCP servers, or skills, and don't rely on views, debugging, or other features that are unavailable in the Agents window are enabled. When set to a list of extension identifiers, such as `publisher.name`, only the listed extensions are enabled, even if they rely on features that are unavailable in the Agents window. You can still disable them from the Extensions section of Agent Customizations. Requires `#{0}#`.", EXTENSIONS_AGENTS_WINDOW_MANAGEMENT),
			default: false,
			tags: ['experimental'],
			// Takes effect on startup, so assignment changes do not start or stop extensions while the window is open.
			experiment: { mode: 'startup' },
		},
		[EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS]: {
			type: 'object',
			patternProperties: {
				[EXTENSION_IDENTIFIER_PATTERN]: { type: 'boolean' },
			},
			additionalProperties: false,
			default: {},
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('extensions.experimental.agentsWindowAutoEnableExtensions', "Controls, for each extension identifier, such as `publisher.name`, whether an installed extension that hasn't declared support for the Agents window is enabled there automatically. Set an extension to `true` to enable it, even if it relies on features that are unavailable in the Agents window, or to `false` to never enable it automatically. Other extensions follow `#{0}#`. You can still enable or disable extensions from the Extensions section of Agent Customizations. Requires `#{1}#`.", EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT),
			tags: ['experimental'],
			// Each extension's value is assigned by its own treatment, so that each extension can be tested in its own
			// experiment. Takes effect on startup, so assignment changes do not start or stop extensions while the window is open.
			experiment: { mode: 'startup', keyed: true },
		},
		[AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING]: {
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize('extensions.experimental.agentsWindowConfirmUninstall', "Controls whether to ask for confirmation before uninstalling an extension from the Extensions section of Agent Customizations, which also uninstalls it from VS Code. Requires `#{0}#`.", EXTENSIONS_AGENTS_WINDOW_MANAGEMENT),
			default: true,
			tags: ['experimental'],
		},
	},
});

registerSingleton(IAgentsWindowExtensionSuggestionsService, AgentsWindowExtensionSuggestionsService, InstantiationType.Delayed);
// Requests the experiment values of extensions as early as possible, so that extensions start with their experiment value.
registerWorkbenchContribution2(AgentsWindowExtensionAutoEnablementExperiment.ID, AgentsWindowExtensionAutoEnablementExperiment, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(AgentsWindowExtensionAutoEnablementTelemetry.ID, AgentsWindowExtensionAutoEnablementTelemetry, WorkbenchPhase.AfterRestored);

// Like Go Back, which returns to the previous editor from the Extensions editor in editor windows, with its keybindings. The
// keybindings run from the page's webviews, which forward their keys to the window, and the section runs them elsewhere on
// the page, as Agent Customizations is a modal that stops the keys of most workbench commands.
KeybindingsRegistry.registerKeybindingRule({
	id: AGENTS_WINDOW_EXTENSIONS_BACK_COMMAND_ID,
	// Higher than Go Back and Sessions: Go Back.
	weight: KeybindingWeight.SessionsContrib + 1,
	when: AgentsWindowExtensionPageContext,
	win: { primary: KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyCode.BrowserBack] },
	mac: { primary: KeyMod.WinCtrl | KeyCode.Minus, secondary: [KeyCode.BrowserBack] },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus, secondary: [KeyCode.BrowserBack] },
});

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Extensions,
	label: localize('agentsWindowExtensions.navigationLabel', "Extensions"),
	icon: extensionsViewIcon,
	description: localize('agentsWindowExtensions.navigationDescription', "Choose which installed extensions run in the Agents window."),
	enablementSettings: [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT],
	separatorBefore: true,
	supportsHarness: () => true,
	create: (instantiationService, container, group) => instantiationService.createInstance(AgentsWindowExtensionsWidget, container, group),
});

aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Extensions, getExtensionSuggestionsSectionBadge);

AccessibleViewRegistry.register(new AgentsWindowExtensionsAccessibilityHelp());
