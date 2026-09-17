/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { workflowConfiguration, WorkflowContextKeys, WorkflowSettingId } from '../../common/workflowConfiguration.js';

suite('Workflow rollout configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('workflow rollout is experimental and disabled by default', () => {
		const property = workflowConfiguration.properties![WorkflowSettingId.Enabled];
		assert.deepStrictEqual({ key: WorkflowSettingId.Enabled, type: property.type, default: property.default, tags: property.tags }, {
			key: 'chat.workflows.enabled',
			type: 'boolean',
			default: false,
			tags: ['experimental'],
		});
	});

	test('the configuration context updates when rollout is enabled and disabled', async () => {
		const configuration = new TestConfigurationService({ [WorkflowSettingId.Enabled]: false });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const context = store.add(new ContextKeyService(configuration));
		const keys = new Set(WorkflowContextKeys.enabled.keys());
		const states = [context.contextMatchesRules(WorkflowContextKeys.enabled)];
		store.add(context.onDidChangeContext(event => {
			if (event.affectsSome(keys)) {
				states.push(context.contextMatchesRules(WorkflowContextKeys.enabled));
			}
		}));
		for (const enabled of [true, false]) {
			await configuration.setUserConfiguration(WorkflowSettingId.Enabled, enabled);
			configuration.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([WorkflowSettingId.Enabled]),
				change: { keys: [WorkflowSettingId.Enabled], overrides: [] },
				affectsConfiguration: key => key === WorkflowSettingId.Enabled,
			});
		}
		assert.deepStrictEqual({ keys: [...keys], states }, { keys: ['config.chat.workflows.enabled'], states: [false, true, false] });
	});
});
