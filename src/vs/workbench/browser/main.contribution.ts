/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { isWindows, isLinux } from 'vs/base/common/platform';


// Configuration
(function registerConfiguration(): void {
	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	// Window
	registry.registerConfiguration({
		'id': 'window',
		'order': 8,
		'title': nls.localize('windowConfigurationTitle', "Window"),
		'type': 'object',
		'properties': {
			'window.menuBarVisibility': {
				'type': 'string',
				'enum': ['default', 'visible', 'toggle', 'hidden'],
				'enumDescriptions': [
					nls.localize('window.menuBarVisibility.default', "Menu is only hidden in full screen mode."),
					nls.localize('window.menuBarVisibility.visible', "Menu is always visible even in full screen mode."),
					nls.localize('window.menuBarVisibility.toggle', "Menu is hidden but can be displayed via Alt key."),
					nls.localize('window.menuBarVisibility.hidden', "Menu is always hidden.")
				],
				'default': 'default',
				'scope': ConfigurationScope.APPLICATION,
				'description': nls.localize('menuBarVisibility', "Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. By default, the menu bar will be visible, unless the window is full screen."),
				'included': isWindows || isLinux
			},
			'window.enableMenuBarMnemonics': {
				'type': 'boolean',
				'default': true,
				'scope': ConfigurationScope.APPLICATION,
				'description': nls.localize('enableMenuBarMnemonics', "If enabled, the main menus can be opened via Alt-key shortcuts. Disabling mnemonics allows to bind these Alt-key shortcuts to editor commands instead."),
				'included': isWindows || isLinux
			},
			'window.disableCustomMenuBarAltFocus': {
				'type': 'boolean',
				'default': false,
				'scope': ConfigurationScope.APPLICATION,
				'markdownDescription': nls.localize('disableCustomMenuBarAltFocus', "If enabled, disables the ability to focus the menu bar with the Alt-key when not set to toggle."),
				'included': isWindows || isLinux
			}
		}
	});
})();