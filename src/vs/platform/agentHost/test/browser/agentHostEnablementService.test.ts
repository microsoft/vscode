/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWeb } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { AgentHostEnablementService } from '../../browser/agentHostEnablementService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../common/agentHostEnablementService.js';

suite('AgentHostEnablementService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('gates Agent Host features on AI enablement', () => {
		const cases = [
			{ agentHostEnabled: true, aiFeaturesDisabled: false },
			{ agentHostEnabled: true, aiFeaturesDisabled: true },
			{ agentHostEnabled: false, aiFeaturesDisabled: false },
		];

		const actual = cases.map(({ agentHostEnabled, aiFeaturesDisabled }) => {
			const configurationService = new TestConfigurationService({
				'chat.agentHost.enabled': agentHostEnabled,
				'chat.disableAIFeatures': aiFeaturesDisabled,
			});
			const contextKeyService = disposables.add(new MockContextKeyService());
			const service = disposables.add(new AgentHostEnablementService(configurationService, contextKeyService));
			return {
				enabled: service.enabled,
				contextKey: contextKeyService.getContextKeyValue(AGENT_HOST_ENABLED_CONTEXT_KEY.key),
			};
		});

		assert.deepStrictEqual(actual, [
			{ enabled: !isWeb, contextKey: !isWeb },
			{ enabled: false, contextKey: false },
			{ enabled: false, contextKey: false },
		]);
	});
});
