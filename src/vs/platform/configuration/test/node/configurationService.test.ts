/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as fs from 'fs';

import { Registry } from 'vs/platform/registry/common/platform';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import * as uuid from 'vs/base/common/uuid';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { testFile } from 'vs/base/test/node/utils';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Event } from 'vs/base/common/event';
import { NullLogService } from 'vs/platform/log/common/log';
import { FileService } from 'vs/platform/files/common/fileService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';

suite('ConfigurationService - Node', () => {

	let fileService: IFileService;
	const disposables: IDisposable[] = [];

	setup(() => {
		const logService = new NullLogService();
		fileService = new FileService(logService);
		disposables.push(fileService);
		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		disposables.push(diskFileSystemProvider);
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);
	});

	test('simple', async () => {
		const res = await testFile('config', 'config.json');
		fs.writeFileSync(res.testFile, '{ "foo": "bar" }');

		const service = new ConfigurationService(URI.file(res.testFile), fileService);
		await service.initialize();
		const config = service.getValue<{
			foo: string;
		}>();

		assert.ok(config);
		assert.equal(config.foo, 'bar');
		service.dispose();

		return res.cleanUp();
	});

	test('config gets flattened', async () => {
		const res = await testFile('config', 'config.json');

		fs.writeFileSync(res.testFile, '{ "testworkbench.editor.tabs": true }');

		const service = new ConfigurationService(URI.file(res.testFile), fileService);
		await service.initialize();
		const config = service.getValue<{
			testworkbench: {
				editor: {
					tabs: boolean;
				};
			};
		}>();
		assert.ok(config);
		assert.ok(config.testworkbench);
		assert.ok(config.testworkbench.editor);
		assert.equal(config.testworkbench.editor.tabs, true);

		service.dispose();
		return res.cleanUp();
	});

	test('error case does not explode', async () => {
		const res = await testFile('config', 'config.json');

		fs.writeFileSync(res.testFile, ',,,,');

		const service = new ConfigurationService(URI.file(res.testFile), fileService);
		await service.initialize();
		const config = service.getValue<{
			foo: string;
		}>();
		assert.ok(config);

		service.dispose();
		return res.cleanUp();
	});

	test('missing file does not explode', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		const service = new ConfigurationService(URI.file(testFile), fileService);
		await service.initialize();

		const config = service.getValue<{ foo: string }>();
		assert.ok(config);

		service.dispose();
	});

	test('trigger configuration change event when file does not exist', async () => {
		const res = await testFile('config', 'config.json');
		const settingsFile = URI.file(res.testFile);
		const service = new ConfigurationService(settingsFile, fileService);
		await service.initialize();
		return new Promise(async (c, e) => {
			const disposable = Event.filter(service.onDidChangeConfiguration, e => e.source === ConfigurationTarget.USER)(async (e) => {
				disposable.dispose();
				assert.equal(service.getValue('foo'), 'bar');
				service.dispose();
				await res.cleanUp();
				c();
			});
			await fileService.writeFile(settingsFile, VSBuffer.fromString('{ "foo": "bar" }'));
		});

	});

	test('trigger configuration change event when file exists', async () => {
		const res = await testFile('config', 'config.json');

		const service = new ConfigurationService(URI.file(res.testFile), fileService);
		fs.writeFileSync(res.testFile, '{ "foo": "bar" }');
		await service.initialize();
		return new Promise((c, e) => {
			const disposable = Event.filter(service.onDidChangeConfiguration, e => e.source === ConfigurationTarget.USER)(async (e) => {
				disposable.dispose();
				assert.equal(service.getValue('foo'), 'barz');
				service.dispose();
				await res.cleanUp();
				c();
			});
			fs.writeFileSync(res.testFile, '{ "foo": "barz" }');
		});

	});

	test('reloadConfiguration', async () => {
		const res = await testFile('config', 'config.json');

		fs.writeFileSync(res.testFile, '{ "foo": "bar" }');

		const service = new ConfigurationService(URI.file(res.testFile), fileService);
		await service.initialize();
		let config = service.getValue<{
			foo: string;
		}>();
		assert.ok(config);
		assert.equal(config.foo, 'bar');
		fs.writeFileSync(res.testFile, '{ "foo": "changed" }');

		// still outdated
		config = service.getValue<{
			foo: string;
		}>();
		assert.ok(config);
		assert.equal(config.foo, 'bar');

		// force a reload to get latest
		await service.reloadConfiguration();
		config = service.getValue<{
			foo: string;
		}>();
		assert.ok(config);
		assert.equal(config.foo, 'changed');

		service.dispose();
		return res.cleanUp();
	});

	test('model defaults', async () => {
		interface ITestSetting {
			configuration: {
				service: {
					testSetting: string;
				}
			};
		}

		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configuration.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		let serviceWithoutFile = new ConfigurationService(URI.file('__testFile'), fileService);
		await serviceWithoutFile.initialize();
		let setting = serviceWithoutFile.getValue<ITestSetting>();

		assert.ok(setting);
		assert.equal(setting.configuration.service.testSetting, 'isSet');

		return testFile('config', 'config.json').then(async res => {
			fs.writeFileSync(res.testFile, '{ "testworkbench.editor.tabs": true }');

			const service = new ConfigurationService(URI.file(res.testFile), fileService);

			let setting = service.getValue<ITestSetting>();

			assert.ok(setting);
			assert.equal(setting.configuration.service.testSetting, 'isSet');

			fs.writeFileSync(res.testFile, '{ "configuration.service.testSetting": "isChanged" }');

			await service.reloadConfiguration();
			let setting_1 = service.getValue<ITestSetting>();
			assert.ok(setting_1);
			assert.equal(setting_1.configuration.service.testSetting, 'isChanged');
			service.dispose();
			serviceWithoutFile.dispose();
			return res.cleanUp();
		});
	});

	test('lookup', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'lookup.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		const r = await testFile('config', 'config.json');
		const service = new ConfigurationService(URI.file(r.testFile), fileService);
		service.initialize();

		let res = service.inspect('something.missing');
		assert.strictEqual(res.value, undefined);
		assert.strictEqual(res.defaultValue, undefined);
		assert.strictEqual(res.userValue, undefined);

		res = service.inspect('lookup.service.testSetting');
		assert.strictEqual(res.defaultValue, 'isSet');
		assert.strictEqual(res.value, 'isSet');
		assert.strictEqual(res.userValue, undefined);

		fs.writeFileSync(r.testFile, '{ "lookup.service.testSetting": "bar" }');

		await service.reloadConfiguration();
		res = service.inspect('lookup.service.testSetting');
		assert.strictEqual(res.defaultValue, 'isSet');
		assert.strictEqual(res.userValue, 'bar');
		assert.strictEqual(res.value, 'bar');

		service.dispose();
		return r.cleanUp();
	});

	test('lookup with null', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_testNull',
			'type': 'object',
			'properties': {
				'lookup.service.testNullSetting': {
					'type': 'null',
				}
			}
		});

		const r = await testFile('config', 'config.json');
		const service = new ConfigurationService(URI.file(r.testFile), fileService);
		service.initialize();

		let res = service.inspect('lookup.service.testNullSetting');
		assert.strictEqual(res.defaultValue, null);
		assert.strictEqual(res.value, null);
		assert.strictEqual(res.userValue, undefined);

		fs.writeFileSync(r.testFile, '{ "lookup.service.testNullSetting": null }');

		await service.reloadConfiguration();

		res = service.inspect('lookup.service.testNullSetting');
		assert.strictEqual(res.defaultValue, null);
		assert.strictEqual(res.value, null);
		assert.strictEqual(res.userValue, null);

		service.dispose();
		return r.cleanUp();
	});
});
