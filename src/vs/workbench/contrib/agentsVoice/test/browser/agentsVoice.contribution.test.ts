/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import '../../browser/agentsVoice.contribution.js';

suite('Voice Mode contribution', () => {

	test('disables Voice Mode when preview features are disabled by policy', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const policy = configurationRegistry.getConfigurationProperties()['agents.voice.enabled'].policy;

		assert.deepStrictEqual({
			name: policy?.name,
			category: policy?.category,
			minimumVersion: policy?.minimumVersion,
			disabled: policy?.value?.({ chat_preview_features_enabled: false }),
			enabled: policy?.value?.({ chat_preview_features_enabled: true }),
			unset: policy?.value?.({}),
		}, {
			name: 'AgentsVoice',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.137',
			disabled: false,
			enabled: undefined,
			unset: undefined,
		});
	});
});
