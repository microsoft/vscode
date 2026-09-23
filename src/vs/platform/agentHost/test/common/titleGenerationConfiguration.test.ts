/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope } from '../../../configuration/common/configurationRegistry.js';
import { AgentHostDeferredTitleGenerationConfigKey } from '../../common/agentHostSchema.js';
import { AgentHostDeferredTitleGenerationSettingId } from '../../common/agentService.js';
import { titleGenerationConfigurationProperties } from '../../common/titleGenerationConfiguration.js';

suite('TitleGenerationConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('deferred title generation supports experiment overrides and host configuration sync', () => {
		const property = titleGenerationConfigurationProperties[AgentHostDeferredTitleGenerationSettingId];

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
