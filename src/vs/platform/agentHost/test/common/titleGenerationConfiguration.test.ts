/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope } from '../../../configuration/common/configurationRegistry.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostDeferredTitleGenerationConfigKey, AgentHostTitleGenerationConfigKey, AgentHostTitleGenerationStrategies } from '../../common/agentHostSchema.js';
import { AgentHostTitleGenerationSettingId } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { migrateLegacyTitleGenerationSettings, resolveTitleGenerationStrategy, supersedeTitleGenerationStrategyForLegacyUpdate, titleGenerationConfigurationProperties } from '../../common/titleGenerationConfiguration.js';

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
			agentHost: { key: property.agentHost.key, derivedKeys: Object.keys(property.agentHost.derivedKeys) },
			legacyKeysByStrategy: AgentHostTitleGenerationStrategies.map(strategy => Object.fromEntries(Object.entries(property.agentHost.derivedKeys).map(([key, derive]) => [key, derive(strategy)]))),
		}, {
			settingIds: ['chat.agentHost.experimental.titleGeneration'],
			type: 'string',
			enum: ['utility', 'activeAgent', 'agentReview'],
			enumDescriptions: 3,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
			agentHost: { key: AgentHostTitleGenerationConfigKey, derivedKeys: [AgentHostActiveAgentTitleGenerationConfigKey, AgentHostDeferredTitleGenerationConfigKey] },
			legacyKeysByStrategy: [
				{ [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: false },
				{ [AgentHostActiveAgentTitleGenerationConfigKey]: true, [AgentHostDeferredTitleGenerationConfigKey]: false },
				{ [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: true },
			],
		});
	});

	test('legacy boolean settings migrate to a selectable strategy only when they select one', () => {
		assert.deepStrictEqual([
			migrateLegacyTitleGenerationSettings(true, true),
			migrateLegacyTitleGenerationSettings(true, undefined),
			migrateLegacyTitleGenerationSettings(false, true),
			migrateLegacyTitleGenerationSettings(undefined, false),
			migrateLegacyTitleGenerationSettings(false, undefined),
			migrateLegacyTitleGenerationSettings(undefined, undefined),
			migrateLegacyTitleGenerationSettings('true', 'false'),
		], ['agentReview', 'agentReview', 'activeAgent', 'utility', undefined, undefined, undefined]);
	});

	test('host prefers the strategy key and keeps legacy deferred naming for older clients', () => {
		assert.deepStrictEqual([
			resolveTitleGenerationStrategy('agentReview', false, true),
			resolveTitleGenerationStrategy('utility', true, true),
			resolveTitleGenerationStrategy(undefined, true, true),
			resolveTitleGenerationStrategy(undefined, false, true),
			resolveTitleGenerationStrategy(undefined, undefined, undefined),
		], ['agentReview', 'utility', 'deferred', 'activeAgent', 'utility']);
	});

	test('a legacy-only root update that changes a legacy key supersedes the stored strategy', () => {
		const stored = { other: 1, [AgentHostTitleGenerationConfigKey]: 'agentReview', [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: true };
		const update = (config: Record<string, unknown>, replace?: boolean, currentValues: Record<string, unknown> | undefined = stored) =>
			supersedeTitleGenerationStrategyForLegacyUpdate(currentValues, { type: ActionType.RootConfigChanged, config, replace });

		assert.deepStrictEqual([
			update({ [AgentHostActiveAgentTitleGenerationConfigKey]: true, [AgentHostDeferredTitleGenerationConfigKey]: false }),
			update({ [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: true }),
			update({ [AgentHostTitleGenerationConfigKey]: 'utility', [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: false }),
			update({ [AgentHostActiveAgentTitleGenerationConfigKey]: true }, true),
			update({ [AgentHostActiveAgentTitleGenerationConfigKey]: true }, undefined, { other: 1 }),
		], [
			{ type: ActionType.RootConfigChanged, config: { other: 1, [AgentHostActiveAgentTitleGenerationConfigKey]: true, [AgentHostDeferredTitleGenerationConfigKey]: false }, replace: true },
			{ type: ActionType.RootConfigChanged, config: { [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: true }, replace: undefined },
			{ type: ActionType.RootConfigChanged, config: { [AgentHostTitleGenerationConfigKey]: 'utility', [AgentHostActiveAgentTitleGenerationConfigKey]: false, [AgentHostDeferredTitleGenerationConfigKey]: false }, replace: undefined },
			{ type: ActionType.RootConfigChanged, config: { [AgentHostActiveAgentTitleGenerationConfigKey]: true }, replace: true },
			{ type: ActionType.RootConfigChanged, config: { [AgentHostActiveAgentTitleGenerationConfigKey]: true }, replace: undefined },
		]);
	});
});
