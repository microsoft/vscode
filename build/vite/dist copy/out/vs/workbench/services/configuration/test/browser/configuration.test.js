/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DefaultConfiguration } from '../../browser/configuration.js';
import { BrowserWorkbenchEnvironmentService } from '../../../environment/browser/environmentService.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
class ConfigurationCache {
    constructor() {
        this.cache = new Map();
    }
    needsCaching(resource) { return false; }
    async read({ type, key }) { return this.cache.get(`${type}:${key}`) || ''; }
    async write({ type, key }, content) { this.cache.set(`${type}:${key}`, content); }
    async remove({ type, key }) { this.cache.delete(`${type}:${key}`); }
}
suite('DefaultConfiguration', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const configurationRegistry = Registry.as(Extensions.Configuration);
    const cacheKey = { type: 'defaults', key: 'default-configurationDefaultsOverrides' };
    let configurationCache;
    setup(() => {
        configurationCache = new ConfigurationCache();
        configurationRegistry.registerConfiguration({
            'id': 'test.configurationDefaultsOverride',
            'type': 'object',
            'properties': {
                'test.configurationDefaultsOverride': {
                    'type': 'string',
                    'default': 'defaultValue',
                }
            }
        });
    });
    teardown(() => {
        configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
        configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
    });
    test('configuration default overrides are read from environment', async () => {
        const environmentService = new BrowserWorkbenchEnvironmentService('', joinPath(URI.file('tests').with({ scheme: 'vscode-tests' }), 'logs'), { configurationDefaults: { 'test.configurationDefaultsOverride': 'envOverrideValue' } }, TestProductService);
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, environmentService, new NullLogService()));
        await testObject.initialize();
        assert.deepStrictEqual(testObject.configurationModel.getValue('test.configurationDefaultsOverride'), 'envOverrideValue');
    });
    test('configuration default overrides are read from cache', async () => {
        localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
        await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        const actual = await testObject.initialize();
        assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'overrideValue');
        assert.deepStrictEqual(testObject.configurationModel.getValue('test.configurationDefaultsOverride'), 'overrideValue');
    });
    test('configuration default overrides are not read from cache when model is read before initialize', async () => {
        localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
        await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        assert.deepStrictEqual(testObject.configurationModel.getValue('test.configurationDefaultsOverride'), undefined);
    });
    test('configuration default overrides read from cache override environment', async () => {
        const environmentService = new BrowserWorkbenchEnvironmentService('', joinPath(URI.file('tests').with({ scheme: 'vscode-tests' }), 'logs'), { configurationDefaults: { 'test.configurationDefaultsOverride': 'envOverrideValue' } }, TestProductService);
        localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
        await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, environmentService, new NullLogService()));
        const actual = await testObject.initialize();
        assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'overrideValue');
    });
    test('configuration default overrides are read from cache when default configuration changed', async () => {
        localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
        await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        await testObject.initialize();
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        configurationRegistry.registerConfiguration({
            'id': 'test.configurationDefaultsOverride',
            'type': 'object',
            'properties': {
                'test.configurationDefaultsOverride1': {
                    'type': 'string',
                    'default': 'defaultValue',
                }
            }
        });
        const { defaults: actual } = await promise;
        assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'overrideValue');
    });
    test('configuration default overrides are not read from cache after reload', async () => {
        localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
        await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        await testObject.initialize();
        const actual = testObject.reload();
        assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'defaultValue');
    });
    test('cache is reset after reload', async () => {
        localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
        await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        await testObject.initialize();
        testObject.reload();
        assert.deepStrictEqual(await configurationCache.read(cacheKey), '');
    });
    test('configuration default overrides are written in cache', async () => {
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        await testObject.initialize();
        testObject.reload();
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        configurationRegistry.registerDefaultConfigurations([{ overrides: { 'test.configurationDefaultsOverride': 'newoverrideValue' } }]);
        await promise;
        const actual = JSON.parse(await configurationCache.read(cacheKey));
        assert.deepStrictEqual(actual, { 'test.configurationDefaultsOverride': 'newoverrideValue' });
    });
    test('configuration default overrides are removed from cache if there are no overrides', async () => {
        const testObject = disposables.add(new DefaultConfiguration('default', configurationCache, TestEnvironmentService, new NullLogService()));
        await testObject.initialize();
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        configurationRegistry.registerConfiguration({
            'id': 'test.configurationDefaultsOverride',
            'type': 'object',
            'properties': {
                'test.configurationDefaultsOverride1': {
                    'type': 'string',
                    'default': 'defaultValue',
                }
            }
        });
        await promise;
        assert.deepStrictEqual(await configurationCache.read(cacheKey), '');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vdGVzdC9icm93c2VyL2NvbmZpZ3VyYXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFVBQVUsRUFBMEIsTUFBTSx1RUFBdUUsQ0FBQztBQUMzSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXRGLE1BQU0sa0JBQWtCO0lBQXhCO1FBQ2tCLFVBQUssR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUtwRCxDQUFDO0lBSkEsWUFBWSxDQUFDLFFBQWEsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEQsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxH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