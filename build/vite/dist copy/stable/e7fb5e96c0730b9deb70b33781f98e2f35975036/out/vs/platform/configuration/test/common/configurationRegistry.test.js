/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, isConfigurationDefaultSourceEquals } from '../../common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';
suite('ConfigurationRegistry', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblJlZ2lzdHJ5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixrQ0FBa0MsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFbkUsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUVuQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7SUFFekcsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDckIsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFFeEIsU0FBUyxLQUFLO1FBQ2IscUJBQXFCLENBQUMsd0JBQXdCLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLHFCQUFxQixDQUFDLCtCQUErQixDQUFDLHFCQUFxQixDQUFDLGtDQUFrQyxFQUFFLENBQUMsQ0FBQztJQUNuSCxDQUFDO0lBRUQsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pDLHFCQUFxQixD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