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
import { PolicyCategory } from '../../../../base/common/policy.js';

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
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' }, }
				}
			},
			'policy.settingB': {
				'type': 'string',
				'default': 'defaultValueB',
				policy: {
					name: 'PolicySettingB',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' }, }
				}
			},
			'policy.objectSetting': {
				'type': 'object',
				'default': {},
				policy: {
					name: 'PolicyObjectSetting',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' }, }
				}
			},
			'policy.arraySetting': {
				'type': 'object',
				'default': [],
				policy: {
					name: 'PolicyArraySetting',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' }, }
				}
			},
			'policy.booleanSetting': {
				'type': 'boolean',
				'default': true,
				policy: {
					name: 'PolicyBooleanSetting',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' }, }
				}
			},
			'policy.internalSetting': {
				'type': 'string',
				'default': 'defaultInternalValue',
				included: false,
				policy: {
					name: 'PolicyInternalSetting',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' }, }
				}
			},
			'policy.ownerSetting': {
				'type': 'boolean',
				'default': true,
				policy: {
					name: 'PolicyShared',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					restrictedValue: true,
					localization: { description: { key: 'shared.owner', value: '' }, }
				}
			},
			'policy.referenceSetting': {
				'type': 'boolean',
				'default': true,
				policyReference: {
					name: 'PolicyShared',
				}
			},
			'policy.orphanReferenceSetting': {
				'type': 'boolean',
				'default': true,
				policyReference: {
					name: 'PolicyOrphanReference',
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

	test('initialize: with boolean type policy as false', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyBooleanSetting': false })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.getValue('policy.booleanSetting'), false);
	});

	test('initialize: with boolean type policy as true', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyBooleanSetting': true })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.deepStrictEqual(acutal.getValue('policy.booleanSetting'), true);
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

	test('initialize: an owning policy applies to both the owner and its references', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyShared': false })));

		await testObject.initialize();
		const actual = testObject.configurationModel;

		assert.strictEqual(actual.getValue('policy.ownerSetting'), false);
		assert.strictEqual(actual.getValue('policy.referenceSetting'), false);
		assert.deepStrictEqual([...actual.keys].sort(), ['policy.ownerSetting', 'policy.referenceSetting']);
	});

	test('initialize: a reference resolves even when its owner is not registered', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyOrphanReference': false })));

		await testObject.initialize();
		const actual = testObject.configurationModel;

		assert.strictEqual(actual.getValue('policy.orphanReferenceSetting'), false);
		assert.deepStrictEqual(actual.keys, ['policy.orphanReferenceSetting']);
	});

	test('initialize: the owner definition is authoritative; a reference only contributes the policy name', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyShared': false })));

		await testObject.initialize();

		// The owner declares restrictedValue; the reference is a pure pointer. The registered
		// definition must be the owner's.
		const definition = policyService.policyDefinitions['PolicyShared'];
		assert.strictEqual(definition?.type, 'boolean');
		assert.strictEqual(definition?.restrictedValue, true);
	});

	test('change: a late-registering owner supersedes an earlier reference definition', async () => {
		// Only the reference for `PolicyOrphanReference` is registered initially (models the editor
		// window: the agent-host reference loads eagerly while the extension policy owner loads later).
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyOrphanReference': false })));
		await testObject.initialize();

		// The synthesized reference definition carries no restrictedValue.
		assert.strictEqual(testObject.configurationModel.getValue('policy.orphanReferenceSetting'), false);
		assert.strictEqual(policyService.policyDefinitions['PolicyOrphanReference']?.restrictedValue, undefined);

		const ownerNode: IConfigurationNode = {
			'id': '_test_late_owner',
			'type': 'object',
			'properties': {
				'policy.lateOwner': {
					'type': 'boolean',
					'default': true,
					policy: {
						name: 'PolicyOrphanReference',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						restrictedValue: true,
						localization: { description: { key: 'late.owner', value: '' }, }
					}
				}
			}
		};

		try {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(ownerNode);
			await promise;

			// The owner's definition (with restrictedValue) must now supersede the reference's, and
			// both settings remain gated by the same policy value.
			assert.strictEqual(policyService.policyDefinitions['PolicyOrphanReference']?.restrictedValue, true);
			assert.strictEqual(testObject.configurationModel.getValue('policy.lateOwner'), false);
			assert.strictEqual(testObject.configurationModel.getValue('policy.orphanReferenceSetting'), false);
		} finally {
			Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([ownerNode]);
		}
	});

	test('change: deregistering the owner falls back to a surviving reference definition', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyOrphanReference': false })));
		await testObject.initialize();

		const ownerNode: IConfigurationNode = {
			'id': '_test_owner_removal',
			'type': 'object',
			'properties': {
				'policy.removableOwner': {
					'type': 'boolean',
					'default': true,
					policy: {
						name: 'PolicyOrphanReference',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						restrictedValue: true,
						localization: { description: { key: 'removable.owner', value: '' }, }
					}
				}
			}
		};
		const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

		let promise = Event.toPromise(testObject.onDidChangeConfiguration);
		registry.registerConfiguration(ownerNode);
		await promise;
		assert.strictEqual(policyService.policyDefinitions['PolicyOrphanReference']?.restrictedValue, true);

		// Removing the owner must re-resolve the policy and fall back to the surviving reference,
		// so the owner-only restrictedValue no longer applies.
		promise = Event.toPromise(testObject.onDidChangeConfiguration);
		registry.deregisterConfigurations([ownerNode]);
		await promise;
		assert.strictEqual(policyService.policyDefinitions['PolicyOrphanReference']?.restrictedValue, undefined);
		assert.strictEqual(testObject.configurationModel.getValue('policy.orphanReferenceSetting'), false);
	});

	test('change: an owning policy update propagates to both the owner and its references', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyShared': false })));
		await testObject.initialize();

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
			await promise;
		});

		const acutal = testObject.configurationModel;
		assert.strictEqual(acutal.getValue('policy.ownerSetting'), undefined);
		assert.strictEqual(acutal.getValue('policy.referenceSetting'), undefined);
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
				category: PolicyCategory.Extensions,
				minimumVersion: '1.0.0',
				localization: { description: { key: '', value: '' }, },
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

	test('initialize: with internal policies', async () => {
		await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ 'PolicyInternalSetting': 'internalValue' })));

		await testObject.initialize();
		const acutal = testObject.configurationModel;

		assert.strictEqual(acutal.getValue('policy.settingA'), undefined);
		assert.strictEqual(acutal.getValue('policy.settingB'), undefined);
		assert.strictEqual(acutal.getValue('policy.internalSetting'), 'internalValue');
		assert.strictEqual(acutal.getValue('nonPolicy.setting'), undefined);
		assert.deepStrictEqual(acutal.keys, ['policy.internalSetting']);
		assert.deepStrictEqual(acutal.overrides, []);
	});

});
