/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
import { shouldPreferDevContainer } from '../../browser/agentsWindowOpenIntent.js';

suite('Agents Window open intent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('gates the Dev Container preference on the Agents Window setting', () => {
		const configurationService = (enabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: enabled,
		});

		assert.deepStrictEqual({
			requestedAndEnabled: shouldPreferDevContainer(true, configurationService(true)),
			requestedAndDisabled: shouldPreferDevContainer(true, configurationService(false)),
			notRequestedAndEnabled: shouldPreferDevContainer(false, configurationService(true)),
			invalidRequestAndEnabled: shouldPreferDevContainer('true', configurationService(true)),
		}, {
			requestedAndEnabled: true,
			requestedAndDisabled: false,
			notRequestedAndEnabled: false,
			invalidRequestAndEnabled: false,
		});
	});
});
