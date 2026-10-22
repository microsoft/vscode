/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY } from '../../../../platform/extensions/common/extensions.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { aiCustomizationManagementSectionRegistry } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { extensionsViewIcon } from '../../../../workbench/contrib/extensions/browser/extensionsIcons.js';
import { AgentsWindowExtensionsAccessibilityHelp } from './agentsWindowExtensionsAccessibilityHelp.js';
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
	},
});

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Extensions,
	label: localize('agentsWindowExtensions.navigationLabel', "Extensions"),
	icon: extensionsViewIcon,
	description: localize('agentsWindowExtensions.navigationDescription', "Choose which installed extensions run in the Agents window."),
	enablementSettings: [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT],
	supportsHarness: () => true,
	create: (instantiationService, container) => instantiationService.createInstance(AgentsWindowExtensionsWidget, container),
});

AccessibleViewRegistry.register(new AgentsWindowExtensionsAccessibilityHelp());
