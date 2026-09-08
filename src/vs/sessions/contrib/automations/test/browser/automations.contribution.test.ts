/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../../platform/product/common/product.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';

import '../../browser/automations.contribution.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const automationEnabledProperty = configurationRegistry.getConfigurationProperties()[CHAT_AUTOMATIONS_ENABLED_SETTING];

suite('Automations Contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Automations on all builds with channel-specific defaults and automatic experiments', () => {
		assert.deepStrictEqual({
			default: automationEnabledProperty.default,
			included: automationEnabledProperty.included,
			experiment: automationEnabledProperty.experiment,
		}, {
			default: product.quality !== 'stable',
			included: undefined,
			experiment: { mode: 'auto' },
		});
	});
});
