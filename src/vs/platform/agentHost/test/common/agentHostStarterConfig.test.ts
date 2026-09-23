/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { AgentHostDeferredTitleGenerationConfigKey } from '../../common/agentHostSchema.js';
import '../../common/agentHostStarter.config.contribution.js';
import { AgentHostDeferredTitleGenerationSettingId } from '../../common/agentService.js';

suite('AgentHostStarterConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('deferred title generation supports experiment overrides and host configuration sync', () => {
		const property = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
			.getConfigurationProperties()[AgentHostDeferredTitleGenerationSettingId];

		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			scope: property.scope,
			experiment: property.experiment,
			agentHost: property.agentHost,
		}, {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
			agentHost: { key: AgentHostDeferredTitleGenerationConfigKey },
		});
	});
});
