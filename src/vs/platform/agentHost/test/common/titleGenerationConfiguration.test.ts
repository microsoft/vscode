/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope } from '../../../configuration/common/configurationRegistry.js';
import { AgentHostAgentTitleReviewConfigKey, AgentHostDeferredTitleGenerationConfigKey } from '../../common/agentHostSchema.js';
import { AgentHostAgentTitleReviewSettingId, AgentHostDeferredTitleGenerationSettingId } from '../../common/agentService.js';
import { titleGenerationConfigurationProperties } from '../../common/titleGenerationConfiguration.js';

suite('TitleGenerationConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const { name, settingId, configKey } of [
		{ name: 'deferred title generation', settingId: AgentHostDeferredTitleGenerationSettingId, configKey: AgentHostDeferredTitleGenerationConfigKey },
		{ name: 'agent title review', settingId: AgentHostAgentTitleReviewSettingId, configKey: AgentHostAgentTitleReviewConfigKey },
	] as const) {
		test(`${name} is default-off with experiment and host sync support`, () => {
			const property = titleGenerationConfigurationProperties[settingId];

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
				agentHost: { key: configKey },
			});
		});
	}
});
