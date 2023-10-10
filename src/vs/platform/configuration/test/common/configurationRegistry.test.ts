/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

suite('ConfigurationRegistry', () => {

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	test('configuration override', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});
		configurationRegistry.registerDefaultConfigurations([{ overrides: { 'config': { a: 1, b: 2 } } }]);
		configurationRegistry.registerDefaultConfigurations([{ overrides: { '[lang]': { a: 2, c: 3 } } }]);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 1, b: 2 });
		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['[lang]'].default, { a: 2, c: 3 });
	});

	test('configuration override defaults - merges defaults', async () => {
		configurationRegistry.registerDefaultConfigurations([{ overrides: { '[lang]': { a: 1, b: 2 } } }]);
		configurationRegistry.registerDefaultConfigurations([{ overrides: { '[lang]': { a: 2, c: 3 } } }]);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['[lang]'].default, { a: 2, b: 2, c: 3 });
	});

	test('configuration defaults - overrides defaults', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});
		configurationRegistry.registerDefaultConfigurations([{ overrides: { 'config': { a: 1, b: 2 } } }]);
		configurationRegistry.registerDefaultConfigurations([{ overrides: { 'config': { a: 2, c: 3 } } }]);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, c: 3 });
	});

	test('registering multiple settings with same policy', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'policy1': {
					'type': 'object',
					policy: {
						name: 'policy',
						minimumVersion: '1.0.0'
					}
				},
				'policy2': {
					'type': 'object',
					policy: {
						name: 'policy',
						minimumVersion: '1.0.0'
					}
				}
			}
		});
		const actual = configurationRegistry.getConfigurationProperties();
		assert.ok(actual['policy1'] !== undefined);
		assert.ok(actual['policy2'] === undefined);
	});
});
