/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { DefaultConfiguration, PolicyConfiguration } from '../../common/configurations.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IPolicyService } from '../../../policy/common/policy.js';
import { FilePolicyService } from '../../../policy/common/filePolicyService.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('PolicyConfiguration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testObject: PolicyConfiguration;
	let fileService: IFileService;
	let policyService: IPolicyService;
	const policyFile = URI.file('policyFile').with({ scheme: 'vscode-tests' });
	const policyConfigurationNode: IConfigurationNode = {
		'id': 'policyConfiguration',
		'order': 1,
		'title': 'a',
		'type': 'object',
		'properties': {
			'policy.settingA': {
				'type': 'string',
				'default': 'defaultValueA',
				policy: {
					name: 'PolicySettingA',
					minimumVersion: '1.0.0',
				}
			},
			'policy.settingB': {
				'type': 'string',
				'default': 'defaultValueB',
				policy: {
					name: 'PolicySettingB',
					minimumVersion: '1.0.0',
				}
			},
			'policy.objectSetting': {
				'type': 'object',
				'default': {},
				policy: {
					name: 'PolicyObjectSetting',
					minimumVersion: '1.0.0',
				}
			},
			'policy.arraySetting': {
				'type': 'object',
				'default': [],
				policy: {
					name: 'PolicyArraySetting',
					minimumVersion: '1.0.0',
				}
			},
			'nonPolicy.setting': {
				'type': 'boolean',
				'default': true
			}
		}
	};

	suiteSetup(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
	suiteTeardown(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));

	setup(async () => {
		const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
		await defaultConfiguration.initialize();
		fileService = disposables.add(new FileService(new NullLogService()));
		const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(policyFile.scheme, diskFileSystemProvider));
		policyService = disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService()));
		testObject = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
	});

	test('initialize: with policies', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueA');
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('initialize: no policies', async () => {
		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.keys, []);
		assert.deepStrictEqual(acutal.overrides, []);
		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
	});

	test('initialize: with policies but not registered', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA', 'PolicySettingB': 'policyValueB', 'PolicySettingC': 'policyValueC' })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueA');
		assert.strictEqual(acutal.getValue('policy.settingB'), 'policyValueB');
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA', 'policy.settingB']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('initialize: with object type policy', async () => {
		const expected = {
			'microsoft': true,
			'github': 'stable',
			'other': 1,
			'complex': {
				'key': 'value'
			},
			'array': [1, 2, 3]
		};
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyObjectSetting': JSON.stringify(expected) })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.getValue('policy.objectSetting'), expected);
	});

	test('initialize: with array type policy', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyArraySetting': JSON.stringify([1]) })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.getValue('policy.arraySetting'), [1]);
	});

	test('initialize: with object type policy ignores policy if value is not valid', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyObjectSetting': '{"a": "b", "hello": }' })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.getValue('policy.objectSetting'), undefined);
	});

	test('initialize: with object type policy ignores policy if there are duplicate keys', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyObjectSetting': '{"microsoft": true, "microsoft": false }' })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.getValue('policy.objectSetting'), undefined);
	});

	test('change: when policy is added', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
		await testObject.initialize();

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA', 'PolicySettingB': 'policyValueB', 'PolicySettingC': 'policyValueC' })));
			await promise;
		});

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueA');
		assert.strictEqual(acutal.getValue('policy.settingB'), 'policyValueB');
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA', 'policy.settingB']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy is updated', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
		await testObject.initialize();

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueAChanged' })));
			await promise;
		});

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), 'policyValueAChanged');
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy is removed', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
		await testObject.initialize();

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
			await promise;
		});

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, []);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy setting is registered', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingC': 'policyValueC' })));
		await testObject.initialize();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		policyConfigurationNode.properties!['policy.settingC'] = {
			'type': 'string',
			'default': 'defaultValueC',
			policy: {
				name: 'PolicySettingC',
				minimumVersion: '1.0.0',
			}
		};
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(deepClone(policyConfigurationNode));
		await promise;

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingC'), 'policyValueC');
		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingC']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy setting is deregistered', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': 'policyValueA' })));
		await testObject.initialize();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]);
		await promise;

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, []);
		assert.deepStrictEqual(acutal.overrides, []);
	});

});
