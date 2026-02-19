/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const PHONON_SECTION = 'phonon';

export const enum PhononConfigurationKey {
	DefaultModel = 'phonon.defaultModel',
	MaxTokens = 'phonon.maxTokens',
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: PHONON_SECTION,
	title: nls.localize('phononConfigurationTitle', "Phonon"),
	type: 'object',
	properties: {
		[PhononConfigurationKey.DefaultModel]: {
			type: 'string',
			default: 'claude-sonnet-4-6',
			enum: [
				'claude-opus-4-6',
				'claude-sonnet-4-6',
				'claude-haiku-4-5-20251001',
			],
			enumDescriptions: [
				nls.localize('phonon.model.opus', "Claude Opus 4.6 - Most capable"),
				nls.localize('phonon.model.sonnet', "Claude Sonnet 4.6 - Balanced"),
				nls.localize('phonon.model.haiku', "Claude Haiku 4.5 - Fastest"),
			],
			description: nls.localize('phonon.defaultModel', "The default Claude model to use for chat."),
		},
		[PhononConfigurationKey.MaxTokens]: {
			type: 'number',
			default: 8192,
			minimum: 256,
			maximum: 32000,
			description: nls.localize('phonon.maxTokens', "Maximum number of tokens in Claude responses."),
		},
	}
});
