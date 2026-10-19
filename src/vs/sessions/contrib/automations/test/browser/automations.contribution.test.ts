/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';

import '../../browser/automations.contribution.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const automationEnabledProperty = configurationRegistry.getConfigurationProperties()[CHAT_AUTOMATIONS_ENABLED_SETTING];
const cloudAutomationEnabledProperty = configurationRegistry.getConfigurationProperties()[CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING];

suite('Automations Contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Automations as enabled by default on all builds with automatic experiments', () => {
		assert.deepStrictEqual({
			default: automationEnabledProperty.default,
			included: automationEnabledProperty.included,
			experiment: automationEnabledProperty.experiment,
		}, {
			default: true,
			included: undefined,
			experiment: { mode: 'auto' },
		});

	});

	test('cloud gate defaults off with machine scope and automatic config treatment', () => {
		const property = cloudAutomationEnabledProperty;
		assert.deepStrictEqual({ id: CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, default: property.default, scope: property.scope, tags: property.tags, experiment: property.experiment },
			{ id: 'chat.automations.cloud.enabled', default: false, scope: ConfigurationScope.MACHINE, tags: ['experimental', 'advanced', 'onExP'], experiment: { mode: 'auto' } });
	});
});
