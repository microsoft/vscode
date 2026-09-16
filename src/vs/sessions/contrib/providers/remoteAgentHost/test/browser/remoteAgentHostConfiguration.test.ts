/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TunnelAgentHostsSettingId } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import '../../browser/remoteAgentHost.contribution.js';

suite('Remote Agent Host configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps additional tunnel names into Agent Host root configuration', () => {
		const mapping = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
			.getAgentHostSyncConfigurations()
			.get(TunnelAgentHostsSettingId);

		assert.deepStrictEqual(mapping, { key: TunnelAgentHostsSettingId });
	});
});
