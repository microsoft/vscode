/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope } from '../../../configuration/common/configurationRegistry.js';
import { AgentHostTitleGenerationConfigKey } from '../../common/agentHostSchema.js';
import { AgentHostTitleGenerationSettingId } from '../../common/agentService.js';
import { resolveTitleGenerationStrategy, titleGenerationConfigurationProperties, titleGenerationStrategyFromLegacySettings } from '../../common/titleGenerationConfiguration.js';

suite('TitleGenerationConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('title generation is a single strategy setting with experiment and host sync support', () => {
		const property = titleGenerationConfigurationProperties[AgentHostTitleGenerationSettingId];

		assert.deepStrictEqual({
			settingIds: Object.keys(titleGenerationConfigurationProperties),
			type: property.type,
			enum: property.enum,
			enumDescriptions: property.enumDescriptions.length,
			scope: property.scope,
			experiment: property.experiment,
			agentHost: property.agentHost,
		}, {
			settingIds: ['chat.agentHost.experimental.titleGeneration'],
			type: 'string',
			enum: ['utility', 'activeAgent', 'deferred', 'deferredAgentReview'],
			enumDescriptions: 4,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
			agentHost: { key: AgentHostTitleGenerationConfigKey },
		});
	});

	test('legacy boolean settings map onto a strategy only when they select one', () => {
		assert.deepStrictEqual([
			titleGenerationStrategyFromLegacySettings(true, true),
			titleGenerationStrategyFromLegacySettings(true, undefined),
			titleGenerationStrategyFromLegacySettings(false, true),
			titleGenerationStrategyFromLegacySettings(undefined, false),
			titleGenerationStrategyFromLegacySettings(false, undefined),
			titleGenerationStrategyFromLegacySettings(undefined, undefined),
			titleGenerationStrategyFromLegacySettings('true', 'false'),
		], ['deferred', 'deferred', 'activeAgent', 'utility', undefined, undefined, undefined]);
	});

	test('host prefers the strategy key and falls back to legacy keys from older clients', () => {
		assert.deepStrictEqual([
			resolveTitleGenerationStrategy('deferredAgentReview', false, true),
			resolveTitleGenerationStrategy('utility', true, true),
			resolveTitleGenerationStrategy(undefined, true, true),
			resolveTitleGenerationStrategy(undefined, false, true),
			resolveTitleGenerationStrategy(undefined, undefined, undefined),
		], ['deferredAgentReview', 'utility', 'deferred', 'activeAgent', 'utility']);
	});
});
