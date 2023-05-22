/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

export const enum AccessibilityVerbositySettingId {
	Terminal = 'accessibility.verbosity.terminal',
	DiffEditor = 'accessibility.verbosity.diff-editor',
	Chat = 'accessibility.verbosity.chat',
	InteractiveEditor = 'accessibility.verbosity.interactiveEditor'
}

const configuration: IConfigurationNode = {
	id: 'accessibility',
	title: localize('accessibilityConfigurationTitle', "Accessibility"),
	type: 'object',
	properties: {
		[AccessibilityVerbositySettingId.Terminal]: {
			description: localize('verbosity.terminal.description', 'Provide information about how to access the terminal accessibility help menu when the terminal is focused'),
			type: 'boolean',
			default: true,
			tags: ['accessibility']
		},
		[AccessibilityVerbositySettingId.DiffEditor]: {
			description: localize('verbosity.diff-editor.description', 'Provide information about how to navigate changes in the diff editor when it is focused'),
			type: 'boolean',
			default: true,
			tags: ['accessibility']
		},
		[AccessibilityVerbositySettingId.Chat]: {
			description: localize('verbosity.chat.description', 'Provide information about how to access the chat help menu when the chat input is focused'),
			type: 'boolean',
			default: true,
			tags: ['accessibility']
		},
		[AccessibilityVerbositySettingId.InteractiveEditor]: {
			description: localize('verbosity.interactiveEditor.description', 'Provide information about how to access the interactive editor accessibility help menu when the interactive editor input is focused'),
			type: 'boolean',
			default: true,
			tags: ['accessibility']
		}
	}
};

export function registerAccessibilityConfiguration() {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration(configuration);
}
