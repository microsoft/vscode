/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	ConfigKey,
	DefaultsOnlyConfigProvider,
	InMemoryConfigProvider,
	getConfigDefaultForKey,
	getConfigKeyRecursively,
} from '../config';

suite('getConfig', function () {
	for (const key of Object.values(ConfigKey)) {
		test(`has default for ${key}`, function () {
			// No news is good news
			getConfigDefaultForKey(key);
		});
	}
});

suite('getConfigKeyRecursively', function () {
	test('handles arbitrary dots', function () {
		const config = {
			'a.b.c': { 'd.e': 'value' },
		};
		assert.strictEqual(getConfigKeyRecursively(config, 'a.b.c.d.e'), 'value');
	});
});

suite('InMemoryConfigProvider', function () {
	test('allows setting and getting config values', function () {
		const configProvider = new InMemoryConfigProvider(new DefaultsOnlyConfigProvider());
		configProvider.setConfig(ConfigKey.DebugOverrideEngine, 'test');
		assert.strictEqual(configProvider.getConfig(ConfigKey.DebugOverrideEngine), 'test');
	});
});
