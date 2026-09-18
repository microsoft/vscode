/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { NESTED_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import '../../browser/sessions.contribution.js';

suite('Sessions - nested-session configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers a default-off automatic experiment at application scope', () => {
		const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[NESTED_SESSIONS_SETTING];

		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			scope: property.scope,
			tags: property.tags,
			experiment: property.experiment,
		}, {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});
});
