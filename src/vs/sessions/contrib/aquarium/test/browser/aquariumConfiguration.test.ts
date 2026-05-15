/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

// Side-effect import: ensures `registerConfiguration` has run before we
// inspect the registry.
import '../../browser/aquarium.contribution.js';
import {
	SESSIONS_DEVELOPER_JOY_AQUARIUM_AS_SESSIONS_SETTING,
	SESSIONS_DEVELOPER_JOY_ENABLED_SETTING,
} from '../../browser/aquariumOverlay.js';

suite('Aquarium configuration schema', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('public developerJoy.enabled is registered, hidden aquariumAsSessions is NOT', () => {
		const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const properties = registry.getConfigurationProperties();
		assert.deepStrictEqual(
			{
				publicEnabledRegistered: properties[SESSIONS_DEVELOPER_JOY_ENABLED_SETTING] !== undefined,
				hiddenAquariumAsSessionsRegistered: properties[SESSIONS_DEVELOPER_JOY_AQUARIUM_AS_SESSIONS_SETTING] !== undefined,
			},
			{
				publicEnabledRegistered: true,
				hiddenAquariumAsSessionsRegistered: false,
			}
		);
	});
});
