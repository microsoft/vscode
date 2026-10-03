/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'workbench',
	properties: {
		'workbench.keybindingTeacher.enabled': {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			markdownDescription: localize(
				'keybindingTeacher.enabled',
				"**Experimental**: When enabled, VS Code will show suggestions for keyboard shortcuts when you use mouse or menu actions that have keybindings."
			)
		},
		'workbench.keybindingTeacher.threshold': {
			type: 'number',
			default: 3,
			minimum: 1,
			maximum: 20,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			markdownDescription: localize(
				'keybindingTeacher.threshold',
				"VS Code will show a keyboard shortcut suggestion every N times you use a mouse/menu action (where N is this threshold value)."
			)
		},
		'workbench.keybindingTeacher.cooldownMinutes': {
			type: 'number',
			default: 60,
			minimum: 0,
			maximum: 1440,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			markdownDescription: localize(
				'keybindingTeacher.cooldownMinutes',
				"Minimum time (in minutes) between showing suggestions for the same command. Set to 0 to always show suggestions after reaching the threshold."
			)
		}
	}
});
