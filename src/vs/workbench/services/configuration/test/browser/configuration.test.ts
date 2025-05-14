/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DefaultConfiguration } from '../../browser/configuration.js';
import { ConfigurationKey, IConfigurationCache } from '../../common/configuration.js';
import { BrowserWorkbenchEnvironmentService } from '../../../environment/browser/environmentService.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';

class ConfigurationCache implements IConfigurationCache {
	private readonly cache = new Map<string, string>();
	needsCaching(resource: URI): boolean { return false; }
	async read({ type, key }: ConfigurationKey): Promise<string> { return this.cache.get(`${type}:${key}`) || ''; }
	async write({ type, key }: ConfigurationKey, content: string): Promise<void> { this.cache.set(`${type}:${key}`, content); }
	async remove({ type, key }: ConfigurationKey): Promise<void> { this.cache.delete(`${type}:${key}`); }
}

suite('DefaultConfiguration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const cacheKey: ConfigurationKey = { type: 'defaults', key: 'configurationDefaultsOverrides' };
	let configurationCache: ConfigurationCache;

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
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, environmentService, new NullLogService()));
		await testObject.initialize();
		assert.deepStrictEqual(testObject.configurationModel.getValue('test.configurationDefaultsOverride'), 'envOverrideValue');
	});

	test('configuration default overrides are read from cache', async () => {
		localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
		await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));

		const actual = await testObject.initialize();

		assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'overrideValue');
		assert.deepStrictEqual(testObject.configurationModel.getValue('test.configurationDefaultsOverride'), 'overrideValue');
	});

	test('configuration default overrides are not read from cache when model is read before initialize', async () => {
		localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
		await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));
		assert.deepStrictEqual(testObject.configurationModel.getValue('test.configurationDefaultsOverride'), undefined);
	});

	test('configuration default overrides read from cache override environment', async () => {
		const environmentService = new BrowserWorkbenchEnvironmentService('', joinPath(URI.file('tests').with({ scheme: 'vscode-tests' }), 'logs'), { configurationDefaults: { 'test.configurationDefaultsOverride': 'envOverrideValue' } }, TestProductService);
		localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
		await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, environmentService, new NullLogService()));

		const actual = await testObject.initialize();

		assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'overrideValue');
	});

	test('configuration default overrides are read from cache when default configuration changed', async () => {
		localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
		await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));
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
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));

		await testObject.initialize();
		const actual = testObject.reload();

		assert.deepStrictEqual(actual.getValue('test.configurationDefaultsOverride'), 'defaultValue');
	});

	test('cache is reset after reload', async () => {
		localStorage.setItem(DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, 'yes');
		await configurationCache.write(cacheKey, JSON.stringify({ 'test.configurationDefaultsOverride': 'overrideValue' }));
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));

		await testObject.initialize();
		testObject.reload();

		assert.deepStrictEqual(await configurationCache.read(cacheKey), '');
	});

	test('configuration default overrides are written in cache', async () => {
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));
		await testObject.initialize();
		testObject.reload();
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		configurationRegistry.registerDefaultConfigurations([{ overrides: { 'test.configurationDefaultsOverride': 'newoverrideValue' } }]);
		await promise;

		const actual = JSON.parse(await configurationCache.read(cacheKey));
		assert.deepStrictEqual(actual, { 'test.configurationDefaultsOverride': 'newoverrideValue' });
	});

	test('configuration default overrides are removed from cache if there are no overrides', async () => {
		const testObject = disposables.add(new DefaultConfiguration(configurationCache, TestEnvironmentService, new NullLogService()));
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
