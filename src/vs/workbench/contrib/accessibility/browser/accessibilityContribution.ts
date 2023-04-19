/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

const configuration: IConfigurationNode = {
	id: 'accessibility',
	title: localize('accessibilityConfigurationTitle', "Accessibility"),
	type: 'object',
	properties: {
		'verbosity': {
			type: 'object',
			description: localize('verbosity.description', 'Provide helpful screen reader information for certain UI elements'),
			properties: {
				'terminal': {
					description: localize('verbose.terminal.description', 'Provide information about how to access the terminal accessibility help menu when the terminal is focused'),
					type: 'boolean',
					default: true
				},
				'diff-editor': {
					description: localize('verbose.diff-editor.description', 'Provide information about how to navigate changes in the diff editor when it is focused'),
					type: 'boolean',
					default: true
				}
			},
			default: {
				'terminal': true,
				'diff-editor': true
			}
		},
	},
};

export function registerAccessibilityConfiguration() {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration(configuration);
}
