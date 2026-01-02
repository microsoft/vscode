/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'keybindingTeacher',
	order: 7.5,
	title: localize('keybindingTeacherConfigurationTitle', 'Keybinding Teacher'),
	type: 'object',
	properties: {
		'keybindingTeacher.enabled': {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize(
				'keybindingTeacher.enabled',
				'When enabled, VS Code will show suggestions for keyboard shortcuts when you use mouse or menu actions that have keybindings.'
			)
		},
		'keybindingTeacher.threshold': {
			type: 'number',
			default: 3,
			minimum: 1,
			maximum: 20,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize(
				'keybindingTeacher.threshold',
				'Number of times you must use a mouse/menu action before VS Code suggests the keyboard shortcut.'
			)
		},
		'keybindingTeacher.cooldownMinutes': {
			type: 'number',
			default: 60,
			minimum: 0,
			maximum: 1440,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize(
				'keybindingTeacher.cooldownMinutes',
				'Minimum time (in minutes) between showing suggestions for the same command. Set to 0 to always show suggestions after reaching the threshold.'
			)
		},
		'keybindingTeacher.showDismissOption': {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: localize(
				'keybindingTeacher.showDismissOption',
				'Show an option to permanently dismiss suggestions for specific commands.'
			)
		}
	}
});
