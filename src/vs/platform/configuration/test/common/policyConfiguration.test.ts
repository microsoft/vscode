/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { DefaultConfiguration, PolicyConfiguration } from 'vs/platform/configuration/common/configurations';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { VSBuffer } from 'vs/base/common/buffer';
import { deepClone } from 'vs/base/common/objects';
import { IPolicyService } from 'vs/platform/policy/common/policy';
import { FilePolicyService } from 'vs/platform/policy/common/filePolicyService';

suite('PolicyConfiguration', () => {

	let testObject: PolicyConfiguration;
	let fileService: IFileService;
	let policyService: IPolicyService;
	const policyFile = URI.file('policyFile').with({ scheme: 'vscode-tests' });
	const disposables = new DisposableStore();
	const policyConfigurationNode: IConfigurationNode = {
		'id': 'policyConfiguration',
		'order': 1,
		'title': 'a',
		'type': 'object',
		'properties': {
			'policy.settingA': {
				'type': 'boolean',
				'default': true,
				policy: {
					name: 'PolicySettingA',
					minimumVersion: '1.0.0',
				}
			},
			'policy.settingB': {
				'type': 'boolean',
				'default': true,
				policy: {
					name: 'PolicySettingB',
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
		const defaultConfiguration = disposables.add(new DefaultConfiguration());
		await defaultConfiguration.initialize();
		fileService = disposables.add(new FileService(new NullLogService()));
		const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		fileService.registerProvider(policyFile.scheme, diskFileSystemProvider);
		policyService = new FilePolicyService(policyFile, fileService, new NullLogService());
		testObject = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService));
	});

	teardown(() => disposables.clear());

	test('initialize: with policies', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.strictEqual(acutal.getValue('policy.settingA'), false);
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
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false, 'PolicySettingB': false, 'PolicySettingC': false })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.strictEqual(acutal.getValue('policy.settingA'), false);
		assert.strictEqual(acutal.getValue('policy.settingB'), false);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA', 'policy.settingB']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy is added', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false })));
		await testObject.initialize();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false, 'PolicySettingB': false, 'PolicySettingC': false })));
		await promise;

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), false);
		assert.strictEqual(acutal.getValue('policy.settingB'), false);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA', 'policy.settingB']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy is updated', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false })));
		await testObject.initialize();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': true })));
		await promise;

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), true);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingA']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy is removed', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false })));
		await testObject.initialize();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
		await promise;

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, []);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy setting is registered', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingC': false })));
		await testObject.initialize();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		policyConfigurationNode.properties!['policy.settingC'] = {
			'type': 'boolean',
			'default': true,
			policy: {
				name: 'PolicySettingC',
				minimumVersion: '1.0.0',
			}
		};
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(deepClone(policyConfigurationNode));
		await promise;

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.settingC'), false);
		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.settingC']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

	test('change: when policy setting is deregistered', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicySettingA': false })));
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
