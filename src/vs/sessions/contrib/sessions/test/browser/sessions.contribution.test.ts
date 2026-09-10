/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING } from '../../browser/views/sessionsList.js';

import '../../browser/sessions.contribution.js';

suite('Sessions Contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('enables collapsed section unread indicators by default with automatic experiments', () => {
		const property = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING];
		assert.deepStrictEqual({
			type: property.type,
			default: property.default,
			experiment: property.experiment,
		}, {
			type: 'boolean',
			default: true,
			experiment: { mode: 'auto' },
		});
	});
});
