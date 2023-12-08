/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { equals } from 'vs/base/common/objects';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { DefaultConfiguration } from 'vs/platform/configuration/common/configurations';
import { Registry } from 'vs/platform/registry/common/platform';

suite('DefaultConfiguration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

	setup(() => reset());
	teardown(() => reset());

	function reset() {
		configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
		const configurationDefaultsOverrides = configurationRegistry.getConfigurationDefaultsOverrides();
		configurationRegistry.deregisterDefaultConfigurations([...configurationDefaultsOverrides.keys()].map(key => ({ extensionId: configurationDefaultsOverrides.get(key)?.source, overrides: { [key]: configurationDefaultsOverrides.get(key)?.value } })));
	}

	test('Test registering a property before initialize', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		const actual = await testObject.initialize();
		assert.strictEqual(actual.getValue('a'), false);
	});

	test('Test registering a property and do not initialize', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		assert.strictEqual(testObject.configurationModel.getValue('a'), undefined);
	});

	test('Test registering a property after initialize', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		await testObject.initialize();
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'defaultConfiguration.testSetting1': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		const { defaults: actual, properties } = await promise;
		assert.strictEqual(actual.getValue('defaultConfiguration.testSetting1'), false);
		assert.deepStrictEqual(properties, ['defaultConfiguration.testSetting1']);
	});

	test('Test registering nested properties', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a.b': {
					'description': '1',
					'type': 'object',
					'default': {},
				},
				'a.b.c': {
					'description': '2',
					'type': 'object',
					'default': '2',
				}
			}
		});

		const actual = await testObject.initialize();

		assert.ok(equals(actual.getValue('a'), { b: { c: '2' } }));
		assert.ok(equals(actual.contents, { 'a': { b: { c: '2' } } }));
		assert.deepStrictEqual(actual.keys, ['a.b', 'a.b.c']);
	});

	test('Test registering the same property again', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': true,
				}
			}
		});
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		const actual = await testObject.initialize();
		assert.strictEqual(true, actual.getValue('a'));
	});

	test('Test registering an override identifier', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerDefaultConfigurations([{
			overrides: {
				'[a]': {
					'b': true
				}
			}
		}]);
		const actual = await testObject.initialize();
		assert.ok(equals(actual.getValue('[a]'), { 'b': true }));
		assert.ok(equals(actual.contents, { '[a]': { 'b': true } }));
		assert.ok(equals(actual.overrides, [{ contents: { 'b': true }, identifiers: ['a'], keys: ['b'] }]));
		assert.deepStrictEqual(actual.keys, ['[a]']);
		assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
	});

	test('Test registering a normal property and override identifier', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'b': {
					'description': 'b',
					'type': 'boolean',
					'default': false,
				}
			}
		});

		configurationRegistry.registerDefaultConfigurations([{
			overrides: {
				'[a]': {
					'b': true
				}
			}
		}]);

		const actual = await testObject.initialize();
		assert.deepStrictEqual(actual.getValue('b'), false);
		assert.ok(equals(actual.getValue('[a]'), { 'b': true }));
		assert.ok(equals(actual.contents, { 'b': false, '[a]': { 'b': true } }));
		assert.ok(equals(actual.overrides, [{ contents: { 'b': true }, identifiers: ['a'], keys: ['b'] }]));
		assert.deepStrictEqual(actual.keys, ['b', '[a]']);
		assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
	});

	test('Test normal property is registered after override identifier', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		configurationRegistry.registerDefaultConfigurations([{
			overrides: {
				'[a]': {
					'b': true
				}
			}
		}]);

		await testObject.initialize();

		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'b': {
					'description': 'b',
					'type': 'boolean',
					'default': false,
				}
			}
		});

		const { defaults: actual, properties } = await promise;
		assert.deepStrictEqual(actual.getValue('b'), false);
		assert.ok(equals(actual.getValue('[a]'), { 'b': true }));
		assert.ok(equals(actual.contents, { 'b': false, '[a]': { 'b': true } }));
		assert.ok(equals(actual.overrides, [{ contents: { 'b': true }, identifiers: ['a'], keys: ['b'] }]));
		assert.deepStrictEqual(actual.keys, ['[a]', 'b']);
		assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
		assert.deepStrictEqual(properties, ['b']);
	});

	test('Test override identifier is registered after property', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'b': {
					'description': 'b',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		await testObject.initialize();

		configurationRegistry.registerDefaultConfigurations([{
			overrides: {
				'[a]': {
					'b': true
				}
			}
		}]);

		const { defaults: actual, properties } = await promise;
		assert.deepStrictEqual(actual.getValue('b'), false);
		assert.ok(equals(actual.getValue('[a]'), { 'b': true }));
		assert.ok(equals(actual.contents, { 'b': false, '[a]': { 'b': true } }));
		assert.ok(equals(actual.overrides, [{ contents: { 'b': true }, identifiers: ['a'], keys: ['b'] }]));
		assert.deepStrictEqual(actual.keys, ['b', '[a]']);
		assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
		assert.deepStrictEqual(properties, ['[a]']);
	});

	test('Test register override identifier and property after initialize', async () => {
		const testObject = disposables.add(new DefaultConfiguration());

		await testObject.initialize();

		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'b': {
					'description': 'b',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		configurationRegistry.registerDefaultConfigurations([{
			overrides: {
				'[a]': {
					'b': true
				}
			}
		}]);

		const actual = testObject.configurationModel;
		assert.deepStrictEqual(actual.getValue('b'), false);
		assert.ok(equals(actual.getValue('[a]'), { 'b': true }));
		assert.ok(equals(actual.contents, { 'b': false, '[a]': { 'b': true } }));
		assert.ok(equals(actual.overrides, [{ contents: { 'b': true }, identifiers: ['a'], keys: ['b'] }]));
		assert.deepStrictEqual(actual.keys, ['b', '[a]']);
		assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
	});

	test('Test deregistering a property', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		const node: IConfigurationNode = {
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'a': {
					'description': 'a',
					'type': 'boolean',
					'default': false,
				}
			}
		};
		configurationRegistry.registerConfiguration(node);
		await testObject.initialize();
		configurationRegistry.deregisterConfigurations([node]);

		const { defaults: actual, properties } = await promise;
		assert.strictEqual(actual.getValue('a'), undefined);
		assert.ok(equals(actual.contents, {}));
		assert.deepStrictEqual(actual.keys, []);
		assert.deepStrictEqual(properties, ['a']);
	});

	test('Test deregistering an override identifier', async () => {
		const testObject = disposables.add(new DefaultConfiguration());
		configurationRegistry.registerConfiguration({
			'id': 'a',
			'order': 1,
			'title': 'a',
			'type': 'object',
			'properties': {
				'b': {
					'description': 'b',
					'type': 'boolean',
					'default': false,
				}
			}
		});
		const node = {
			overrides: {
				'[a]': {
					'b': true
				}
			}
		};
		configurationRegistry.registerDefaultConfigurations([node]);
		await testObject.initialize();
		configurationRegistry.deregisterDefaultConfigurations([node]);
		assert.deepStrictEqual(testObject.configurationModel.getValue('[a]'), undefined);
		assert.ok(equals(testObject.configurationModel.contents, { 'b': false }));
		assert.ok(equals(testObject.configurationModel.overrides, []));
		assert.deepStrictEqual(testObject.configurationModel.keys, ['b']);
		assert.strictEqual(testObject.configurationModel.getOverrideValue('b', 'a'), undefined);
	});
});
