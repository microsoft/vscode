/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IConfigurationValue, IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { URI } from 'vs/base/common/uri';


suite('TextResourceConfigurationService - Update', () => {

	let configurationValue: IConfigurationValue<any>;
	let updateArgs: any[];
	let configurationService = new class extends TestConfigurationService {
		inspectValue(key: string) {
			return configurationValue;
		}
		updateValue() {
			updateArgs = [...arguments];
			return Promise.resolve();
		}
	}();
	let language: string | null = null;
	let testObject: TextResourceConfigurationService;

	setup(() => {
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IModelService, <Partial<IModelService>>{ getModel() { return null; } });
		instantiationService.stub(IModeService, <Partial<IModeService>>{ getModeIdByFilepathOrFirstLine() { return language; } });
		instantiationService.stub(IConfigurationService, configurationService);
		testObject = instantiationService.createInstance(TextResourceConfigurationService);
	});

	test('updateValue writes without target and overrides when no language is defined', async () => {
		await testObject.updateValue(URI.file('someFile'), 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b']);
	});

	test('updateValue writes with target and without overrides when no language is defined', async () => {
		await testObject.updateValue(URI.file('someFile'), 'a', 'b', ConfigurationTarget.USER_LOCAL);
		assert.deepEqual(updateArgs, ['a', 'b', ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into given memory target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: [],
			getWorkspaceFolderValue() { return { value: '2', overrides: [] }; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.MEMORY);
		assert.deepEqual(updateArgs, ['a', 'b', ConfigurationTarget.MEMORY]);
	});

	test('updateValue writes into given workspace target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: [],
			getWorkspaceFolderValue() { return { value: '2', overrides: [] }; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.WORKSPACE);
		assert.deepEqual(updateArgs, ['a', 'b', ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into given user target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: [],
			getWorkspaceFolderValue() { return { value: '2', overrides: [{ overrideIdentifier: 'b', value: '1' }] }; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.USER);
		assert.deepEqual(updateArgs, ['a', 'b', { resource }, ConfigurationTarget.USER]);
	});

	test('updateValue writes into given workspace folder target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: [],
			getWorkspaceFolderValue() { return { value: '2', overrides: [{ overrideIdentifier: 'a', value: '1' }] }; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.WORKSPACE_FOLDER);
		assert.deepEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
	});

	test('updateValue writes into derived workspace folder target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: [],
			getWorkspaceFolderValue() { return { value: '2', overrides: [] }; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource }, ConfigurationTarget.WORKSPACE_FOLDER]);
	});

	test('updateValue writes into derived workspace folder target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: { value: '2', overrides: [{ overrideIdentifier: 'a', value: '3' }] },
			workspaceFolders: [],
			getWorkspaceFolderValue() { return { value: '2', overrides: [{ overrideIdentifier: 'a', value: '1' }] }; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
	});

	test('updateValue writes into derived workspace target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: { value: '2', overrides: [{ overrideIdentifier: 'c', value: '3' }] },
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource }, ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into derived workspace target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: undefined,
			workspace: { value: '2', overrides: [{ overrideIdentifier: 'a', value: '3' }] },
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into derived user remote target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: { value: '3', overrides: [] },
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user remote target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: { value: '3', overrides: [{ overrideIdentifier: 'a', value: '3' }] },
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
	});
	test('updateValue writes into derived user remote target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: { value: '3', overrides: [] },
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user remote target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [] },
			userRemote: { value: '3', overrides: [{ overrideIdentifier: 'a', value: '3' }] },
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [{ overrideIdentifier: 'b', value: '3' }] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', { resource }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into derived user target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: { value: '2', overrides: [{ overrideIdentifier: 'a', value: '3' }] },
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', '2');
		assert.deepEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue when not changed', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', overrides: [] },
			userLocal: undefined,
			userRemote: undefined,
			workspace: undefined,
			workspaceFolders: undefined,
			getWorkspaceFolderValue() { return undefined; },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepEqual(updateArgs, ['a', 'b', ConfigurationTarget.USER_LOCAL]);
	});

});
