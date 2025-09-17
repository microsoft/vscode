/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

const planningModeConfiguration = {
	id: 'planningMode',
	order: 50,
	title: localize('planningModeConfigurationTitle', "Planning Mode"),
	type: 'object',
	properties: {
		'planningMode.enabled': {
			type: 'boolean' as const,
			default: true,
			markdownDescription: localize('planningMode.enabled', "Enable Planning Mode functionality. When disabled, Planning Mode cannot be activated."),
			scope: ConfigurationScope.APPLICATION
		},
		'planningMode.autoRestrictEditing': {
			type: 'boolean' as const,
			default: true,
			markdownDescription: localize('planningMode.autoRestrictEditing', "Automatically restrict file editing when Planning Mode is activated."),
			scope: ConfigurationScope.APPLICATION
		},
		'planningMode.showStatusBar': {
			type: 'boolean' as const,
			default: true,
			markdownDescription: localize('planningMode.showStatusBar', "Show Planning Mode status in the status bar when active."),
			scope: ConfigurationScope.APPLICATION
		},
		'planningMode.conversationTracking': {
			type: 'boolean' as const,
			default: true,
			markdownDescription: localize('planningMode.conversationTracking', "Enable conversation tracking to log all interactions for delegation purposes."),
			scope: ConfigurationScope.APPLICATION
		},
		'planningMode.notificationLevel': {
			type: 'string' as const,
			enum: ['none', 'info', 'warning', 'error'],
			default: 'info',
			enumDescriptions: [
				localize('planningMode.notificationLevel.none', "No notifications"),
				localize('planningMode.notificationLevel.info', "Show informational notifications"),
				localize('planningMode.notificationLevel.warning', "Show warnings and errors"),
				localize('planningMode.notificationLevel.error', "Show only errors")
			],
			markdownDescription: localize('planningMode.notificationLevel', "Control the level of notifications shown for Planning Mode operations."),
			scope: ConfigurationScope.APPLICATION
		},
		'planningMode.exportFormat': {
			type: 'string' as const,
			enum: ['markdown', 'json'],
			default: 'markdown',
			enumDescriptions: [
				localize('planningMode.exportFormat.markdown', "Export as Markdown format"),
				localize('planningMode.exportFormat.json', "Export as JSON format")
			],
			markdownDescription: localize('planningMode.exportFormat', "Default format for exporting conversation history."),
			scope: ConfigurationScope.APPLICATION
		}
	}
};

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(planningModeConfiguration);
