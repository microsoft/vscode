/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget, isConfigured } from '../../common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../common/configurationRegistry.js';
import { ConfigurationService } from '../../common/configurationService.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { FilePolicyService } from '../../../policy/common/filePolicyService.js';
import { NullPolicyService } from '../../../policy/common/policy.js';
import { Registry } from '../../../registry/common/platform.js';
import { PolicyCategory } from '../../../../base/common/policy.js';

suite('ConfigurationService.test.ts', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: IFileService;
	let settingsResource: URI;

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));
		settingsResource = URI.file('settings.json');
	});

	test('simple', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();
		const config = testObject.getValue<{
			foo: string;
		}>();

		assert.ok(config);
		assert.strictEqual(config.foo, 'bar');
	}));

	test('config gets flattened', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));

		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();
		const config = testObject.getValue<{
			testworkbench: {
				editor: {
					tabs: boolean;
				};
			};
		}>();

		assert.ok(config);
		assert.ok(config.testworkbench);
		assert.ok(config.testworkbench.editor);
		assert.strictEqual(config.testworkbench.editor.tabs, true);
	}));

	test('error case does not explode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(settingsResource, VSBuffer.fromString(',,,,'));

		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();
		const config = testObject.getValue<{
			foo: string;
		}>();

		assert.ok(config);
	}));

	test('missing file does not explode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const testObject = disposables.add(new ConfigurationService(URI.file('__testFile'), fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		const config = testObject.getValue<{ foo: string }>();

		assert.ok(config);
	}));

	test('trigger configuration change event when file does not exist', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();
		return new Promise<void>((c, e) => {
			disposables.add(Event.filter(testObject.onDidChangeConfiguration, e => e.source === ConfigurationTarget.USER)(() => {
				assert.strictEqual(testObject.getValue('foo'), 'bar');
				c();
			}));
			fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }')).catch(e);
		});

	}));

	test('trigger configuration change event when file exists', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
		await testObject.initialize();

		return new Promise<void>((c) => {
			disposables.add(Event.filter(testObject.onDidChangeConfiguration, e => e.source === ConfigurationTarget.USER)(async (e) => {
				assert.strictEqual(testObject.getValue('foo'), 'barz');
				c();
			}));
			fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "barz" }'));
		});
	}));

	test('reloadConfiguration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));

		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();
		let config = testObject.getValue<{
			foo: string;
		}>();
		assert.ok(config);
		assert.strictEqual(config.foo, 'bar');
		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "changed" }'));

		// force a reload to get latest
		await testObject.reloadConfiguration();
		config = testObject.getValue<{
			foo: string;
		}>();
		assert.ok(config);
		assert.strictEqual(config.foo, 'changed');
	}));

	test('model defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		interface ITestSetting {
			configuration: {
				service: {
					testSetting: string;
				};
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

		let testObject = disposables.add(new ConfigurationService(URI.file('__testFile'), fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();
		let setting = testObject.getValue<ITestSetting>();

		assert.ok(setting);
		assert.strictEqual(setting.configuration.service.testSetting, 'isSet');

		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
		testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		setting = testObject.getValue<ITestSetting>();

		assert.ok(setting);
		assert.strictEqual(setting.configuration.service.testSetting, 'isSet');

		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "configuration.service.testSetting": "isChanged" }'));

		await testObject.reloadConfiguration();
		setting = testObject.getValue<ITestSetting>();
		assert.ok(setting);
		assert.strictEqual(setting.configuration.service.testSetting, 'isChanged');
	}));

	test('lookup', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
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

		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		let res = testObject.inspect('something.missing');
		assert.strictEqual(res.value, undefined);
		assert.strictEqual(res.defaultValue, undefined);
		assert.strictEqual(res.userValue, undefined);
		assert.strictEqual(isConfigured(res), false);

		res = testObject.inspect('lookup.service.testSetting');
		assert.strictEqual(res.defaultValue, 'isSet');
		assert.strictEqual(res.value, 'isSet');
		assert.strictEqual(res.userValue, undefined);
		assert.strictEqual(isConfigured(res), false);

		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testSetting": "bar" }'));

		await testObject.reloadConfiguration();
		res = testObject.inspect('lookup.service.testSetting');
		assert.strictEqual(res.defaultValue, 'isSet');
		assert.strictEqual(res.userValue, 'bar');
		assert.strictEqual(res.value, 'bar');
		assert.strictEqual(isConfigured(res), true);

	}));

	test('lookup with null', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
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

		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		let res = testObject.inspect('lookup.service.testNullSetting');
		assert.strictEqual(res.defaultValue, null);
		assert.strictEqual(res.value, null);
		assert.strictEqual(res.userValue, undefined);

		await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testNullSetting": null }'));

		await testObject.reloadConfiguration();

		res = testObject.inspect('lookup.service.testNullSetting');
		assert.strictEqual(res.defaultValue, null);
		assert.strictEqual(res.value, null);
		assert.strictEqual(res.userValue, null);
	}));

	test('update configuration', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		await testObject.updateValue('configurationService.testSetting', 'value');
		assert.strictEqual(testObject.getValue('configurationService.testSetting'), 'value');
	});

	test('update configuration when exist', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		await testObject.updateValue('configurationService.testSetting', 'value');
		await testObject.updateValue('configurationService.testSetting', 'updatedValue');
		assert.strictEqual(testObject.getValue('configurationService.testSetting'), 'updatedValue');
	});

	test('update configuration to default value should remove', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		await testObject.updateValue('configurationService.testSetting', 'value');
		await testObject.updateValue('configurationService.testSetting', 'isSet');
		const inspect = testObject.inspect('configurationService.testSetting');

		assert.strictEqual(inspect.userValue, undefined);
	});

	test('update configuration should remove when undefined is passed', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		await testObject.updateValue('configurationService.testSetting', 'value');
		await testObject.updateValue('configurationService.testSetting', undefined);
		const inspect = testObject.inspect('configurationService.testSetting');

		assert.strictEqual(inspect.userValue, undefined);
	});

	test('update unknown configuration', async () => {
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		await testObject.updateValue('configurationService.unknownSetting', 'value');
		assert.strictEqual(testObject.getValue('configurationService.unknownSetting'), 'value');
	});

	test('update configuration in non user target throws error', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
		await testObject.initialize();

		try {
			await testObject.updateValue('configurationService.testSetting', 'value', ConfigurationTarget.WORKSPACE);
			assert.fail('Should fail with error');
		} catch (e) {
			// succeess
		}
	});

	test('update configuration throws error for policy setting', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.policySetting': {
					'type': 'string',
					'default': 'isSet',
					policy: {
						name: 'configurationService.policySetting',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						localization: { description: { key: '', value: '' }, }
					}
				}
			}
		});

		const logService = new NullLogService();
		const policyFile = URI.file('policies.json');
		await fileService.writeFile(policyFile, VSBuffer.fromString('{ "configurationService.policySetting": "policyValue" }'));
		const policyService = disposables.add(new FilePolicyService(policyFile, fileService, logService));
		const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, policyService, logService));
		await testObject.initialize();

		try {
			await testObject.updateValue('configurationService.policySetting', 'value');
			assert.fail('Should throw error');
		} catch (error) {
			// succeess
		}
	});
});
