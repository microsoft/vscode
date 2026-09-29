/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry, isConfigurationDefaultSourceEquals } from '../../common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';

suite('ConfigurationRegistry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	setup(() => reset());
	teardown(() => reset());

	function reset() {
		configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
		configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
	}

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

	test('configuration override defaults - prevent overriding default value', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config.preventDefaultValueOverride': {
					'type': 'object',
					default: { a: 0 },
					'disallowConfigurationDefault': true
				}
			}
		});

		configurationRegistry.registerDefaultConfigurations([{ overrides: { 'config.preventDefaultValueOverride': { a: 1, b: 2 } } }]);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config.preventDefaultValueOverride'].default, { a: 0 });
	});

	test('configuration override defaults - merges defaults', async () => {
		configurationRegistry.registerDefaultConfigurations([{ overrides: { '[lang]': { a: 1, b: 2 } } }]);
		configurationRegistry.registerDefaultConfigurations([{ overrides: { '[lang]': { a: 2, c: 3 } } }]);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['[lang]'].default, { a: 2, b: 2, c: 3 });
	});

	test('configuration defaults - merge object default overrides', async () => {
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

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, b: 2, c: 3 });
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
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						localization: { description: { key: '', value: '' }, }
					}
				},
				'policy2': {
					'type': 'object',
					policy: {
						name: 'policy',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						localization: { description: { key: '', value: '' }, }
					}
				}
			}
		});
		const actual = configurationRegistry.getConfigurationProperties();
		assert.ok(actual['policy1'] !== undefined);
		assert.ok(actual['policy2'] === undefined);
	});

	test('a policyReference attaches a subordinate setting to an owning policy', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'policy.owner': {
					'type': 'boolean',
					policy: {
						name: 'sharedPolicy',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						localization: { description: { key: 'owner', value: '' }, }
					}
				},
				'policy.subordinate': {
					'type': 'boolean',
					policyReference: {
						name: 'sharedPolicy',
					}
				}
			}
		});
		const actual = configurationRegistry.getConfigurationProperties();
		assert.ok(actual['policy.owner'] !== undefined);
		assert.ok(actual['policy.subordinate'] !== undefined);
		assert.strictEqual(configurationRegistry.getPolicyConfigurations().get('sharedPolicy'), 'policy.owner');
		assert.deepStrictEqual([...(configurationRegistry.getPolicyReferenceConfigurations().get('sharedPolicy') ?? [])], ['policy.subordinate']);
	});

	test('a policyReference does not require its owner to be registered', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'policy.orphanReference': {
					'type': 'boolean',
					policyReference: {
						name: 'externallyOwnedPolicy',
					}
				}
			}
		});
		const actual = configurationRegistry.getConfigurationProperties();
		assert.ok(actual['policy.orphanReference'] !== undefined);
		assert.strictEqual(configurationRegistry.getPolicyConfigurations().get('externallyOwnedPolicy'), undefined);
		assert.deepStrictEqual([...(configurationRegistry.getPolicyReferenceConfigurations().get('externallyOwnedPolicy') ?? [])], ['policy.orphanReference']);
	});

	test('a setting declaring both policy and policyReference is rejected', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'policy.both': {
					'type': 'boolean',
					policy: {
						name: 'policyBoth',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						localization: { description: { key: 'both', value: '' }, }
					},
					policyReference: {
						name: 'policyBothReference',
					}
				}
			}
		});
		const actual = configurationRegistry.getConfigurationProperties();
		assert.ok(actual['policy.both'] === undefined);
		assert.strictEqual(configurationRegistry.getPolicyConfigurations().get('policyBoth'), undefined);
		assert.strictEqual(configurationRegistry.getPolicyReferenceConfigurations().get('policyBothReference'), undefined);
	});

	test('configuration defaults - deregister merged object default override', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});

		const overrides1 = [{ overrides: { 'config': { a: 1, b: 2 } }, source: { id: 'source1', displayName: 'source1' } }];
		const overrides2 = [{ overrides: { 'config': { a: 2, c: 3 } }, source: { id: 'source2', displayName: 'source2' } }];

		configurationRegistry.registerDefaultConfigurations(overrides1);
		configurationRegistry.registerDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, b: 2, c: 3 });

		configurationRegistry.deregisterDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 1, b: 2 });

		configurationRegistry.deregisterDefaultConfigurations(overrides1);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, {});
	});

	test('configuration defaults - deregister merged object default override without source', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});

		const overrides1 = [{ overrides: { 'config': { a: 1, b: 2 } } }];
		const overrides2 = [{ overrides: { 'config': { a: 2, c: 3 } } }];

		configurationRegistry.registerDefaultConfigurations(overrides1);
		configurationRegistry.registerDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, b: 2, c: 3 });

		configurationRegistry.deregisterDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 1, b: 2 });

		configurationRegistry.deregisterDefaultConfigurations(overrides1);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, {});
	});

	test('configuration defaults - deregister merged object default language overrides', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});

		const overrides1 = [{ overrides: { '[lang]': { 'config': { a: 1, b: 2 } } }, source: { id: 'source1', displayName: 'source1' } }];
		const overrides2 = [{ overrides: { '[lang]': { 'config': { a: 2, c: 3 } } }, source: { id: 'source2', displayName: 'source2' } }];

		configurationRegistry.registerDefaultConfigurations(overrides1);
		configurationRegistry.registerDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['[lang]'].default, { 'config': { a: 2, b: 2, c: 3 } });

		configurationRegistry.deregisterDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['[lang]'].default, { 'config': { a: 1, b: 2 } });

		configurationRegistry.deregisterDefaultConfigurations(overrides1);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['[lang]'], undefined);
	});

	test('configuration defaults - string source', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});

		const overrides1 = [{ overrides: { 'config': { a: 1, b: 2 } }, source: 'source1' }];
		const overrides2 = [{ overrides: { 'config': { a: 2, c: 3 } }, source: 'source2' }];

		configurationRegistry.registerDefaultConfigurations(overrides1);
		configurationRegistry.registerDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, b: 2, c: 3 });
		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].defaultValueSource instanceof Map, true);

		configurationRegistry.deregisterDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 1, b: 2 });

		configurationRegistry.deregisterDefaultConfigurations(overrides1);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, {});
	});

	test('configuration defaults - deregister with string source and extension source', async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_default',
			'type': 'object',
			'properties': {
				'config': {
					'type': 'object',
				}
			}
		});

		const overrides1 = [{ overrides: { 'config': { a: 1, b: 2 } }, source: 'stringSource' }];
		const overrides2 = [{ overrides: { 'config': { a: 2, c: 3 } }, source: { id: 'extSource', displayName: 'Extension Source' } }];

		configurationRegistry.registerDefaultConfigurations(overrides1);
		configurationRegistry.registerDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, b: 2, c: 3 });

		configurationRegistry.deregisterDefaultConfigurations(overrides1);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, { a: 2, c: 3 });

		configurationRegistry.deregisterDefaultConfigurations(overrides2);

		assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()['config'].default, {});
	});

	suite('isConfigurationDefaultSourceEquals', () => {

		test('both undefined', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals(undefined, undefined), true);
		});

		test('one undefined', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals('source', undefined), false);
			assert.strictEqual(isConfigurationDefaultSourceEquals(undefined, 'source'), false);
			assert.strictEqual(isConfigurationDefaultSourceEquals({ id: 'ext' }, undefined), false);
			assert.strictEqual(isConfigurationDefaultSourceEquals(undefined, { id: 'ext' }), false);
		});

		test('same string source', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals('source', 'source'), true);
		});

		test('different string sources', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals('source1', 'source2'), false);
		});

		test('same extension source', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals({ id: 'ext' }, { id: 'ext' }), true);
		});

		test('different extension sources', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals({ id: 'ext1' }, { id: 'ext2' }), false);
		});

		test('string vs extension source', () => {
			assert.strictEqual(isConfigurationDefaultSourceEquals('ext', { id: 'ext' }), false);
			assert.strictEqual(isConfigurationDefaultSourceEquals({ id: 'ext' }, 'ext'), false);
		});

		test('same reference', () => {
			const source = { id: 'ext', displayName: 'Extension' };
			assert.strictEqual(isConfigurationDefaultSourceEquals(source, source), true);
		});
	});
});
