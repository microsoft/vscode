/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Extensions } from '../../common/configurationRegistry.js';
import { DefaultConfiguration } from '../../common/configurations.js';
import { NullLogService } from '../../../log/common/log.js';
import { Registry } from '../../../registry/common/platform.js';
suite('DefaultConfiguration', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const configurationRegistry = Registry.as(Extensions.Configuration);
    setup(() => reset());
    teardown(() => reset());
    function reset() {
        configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
        configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
    }
    test('Test registering a property before initialize', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        assert.deepStrictEqual(actual.keys.sort(), ['a.b', 'a.b.c']);
    });
    test('Test registering the same property again', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        assert.deepStrictEqual(actual.keys.sort(), ['[a]']);
        assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
    });
    test('Test registering a normal property and override identifier', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        assert.deepStrictEqual(actual.keys.sort(), ['[a]', 'b']);
        assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
    });
    test('Test normal property is registered after override identifier', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        assert.deepStrictEqual(actual.keys.sort(), ['[a]', 'b']);
        assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
        assert.deepStrictEqual(properties, ['b']);
    });
    test('Test override identifier is registered after property', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        assert.deepStrictEqual(actual.keys.sort(), ['[a]', 'b']);
        assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
        assert.deepStrictEqual(properties, ['[a]']);
    });
    test('Test register override identifier and property after initialize', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
        assert.deepStrictEqual(actual.keys.sort(), ['[a]', 'b']);
        assert.strictEqual(actual.getOverrideValue('b', 'a'), true);
    });
    test('Test deregistering a property', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        const node = {
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
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
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
    test('Test deregistering a merged language object setting', async () => {
        const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
        configurationRegistry.registerConfiguration({
            'id': 'b',
            'order': 1,
            'title': 'b',
            'type': 'object',
            'properties': {
                'b': {
                    'description': 'b',
                    'type': 'object',
                    'default': {},
                }
            }
        });
        const node1 = {
            overrides: {
                '[a]': {
                    'b': {
                        'aa': '1',
                        'bb': '2'
                    }
                }
            },
            source: { id: 'source1', displayName: 'source1' }
        };
        const node2 = {
            overrides: {
                '[a]': {
                    'b': {
                        'bb': '20',
                        'cc': '30'
                    }
                }
            },
            source: { id: 'source2', displayName: 'source2' }
        };
        configurationRegistry.registerDefaultConfigurations([node1]);
        configurationRegistry.registerDefaultConfigurations([node2]);
        await testObject.initialize();
        configurationRegistry.deregisterDefaultConfigurations([node1]);
        assert.ok(equals(testObject.configurationModel.getValue('[a]'), { 'b': { 'bb': '20', 'cc': '30' } }));
        assert.ok(equals(testObject.configurationModel.contents, { '[a]': { 'b': { 'bb': '20', 'cc': '30' } }, 'b': {} }));
        assert.ok(equals(testObject.configurationModel.overrides, [{ contents: { 'b': { 'bb': '20', 'cc': '30' } }, identifiers: ['a'], keys: ['b'] }]));
        assert.deepStrictEqual(testObject.configurationModel.keys.sort(), ['[a]', 'b']);
        assert.ok(equals(testObject.configurationModel.getOverrideValue('b', 'a'), { 'bb': '20', 'cc': '30' }));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vY29uZmlndXJhdGlvbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxFQUE4QyxNQUFNLHVDQUF1QyxDQUFDO0FBQy9HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEUsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUVsQyxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBQzlELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBRTVGLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ3JCLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBRXhCLFNBQVMsS0FBSztRQUNiLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUMxRixxQkFBcUIsQ0FBQywrQkFBK0Is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