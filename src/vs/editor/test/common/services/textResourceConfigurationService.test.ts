/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IModelService } from '../../../common/services/model.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { IConfigurationValue, IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { TextResourceConfigurationService } from '../../../common/services/textResourceConfigurationService.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';


suite('TextResourceConfigurationService - Update', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationValue: IConfigurationValue<any> = {};
	let updateArgs: any[];
	const configurationService = new class extends TestConfigurationService {
		override inspect() {
			return configurationValue;
		}
		override updateValue() {
			updateArgs = [...arguments];
			return Promise.resolve();
		}
	}();
	let language: string | null = null;
	let testObject: TextResourceConfigurationService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IModelService, { getModel() { return null; } });
		instantiationService.stub(ILanguageService, { guessLanguageIdByFilepathOrFirstLine() { return language; } });
		instantiationService.stub(IConfigurationService, configurationService);
		testObject = disposables.add(instantiationService.createInstance(TextResourceConfigurationService));
	});

	test('updateValue writes without target and overrides when no language is defined', async () => {
		const resource = URI.file('someFile');
		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes with target and without overrides when no language is defined', async () => {
		const resource = URI.file('someFile');
		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.USER_LOCAL);
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into given memory target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspaceFolder: { value: '1' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.MEMORY);
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.MEMORY]);
	});

	test('updateValue writes into given workspace target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspaceFolder: { value: '2' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.WORKSPACE);
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into given user target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspaceFolder: { value: '2' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.USER);
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.USER]);
	});

	test('updateValue writes into given workspace folder target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspaceFolder: { value: '2', override: '1' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b', ConfigurationTarget.WORKSPACE_FOLDER);
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
	});

	test('updateValue writes into derived workspace folder target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspaceFolder: { value: '2' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.WORKSPACE_FOLDER]);
	});

	test('updateValue writes into derived workspace folder target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspace: { value: '2', override: '1' },
			workspaceFolder: { value: '2', override: '2' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
	});

	test('updateValue writes into derived workspace target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspace: { value: '2' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into derived workspace target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			workspace: { value: '2', override: '2' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into derived workspace target with overrides and value defined in folder', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', override: '3' },
			userLocal: { value: '2' },
			workspace: { value: '2', override: '2' },
			workspaceFolder: { value: '2' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
	});

	test('updateValue writes into derived user remote target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			userRemote: { value: '2' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user remote target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			userRemote: { value: '2', override: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user remote target with overrides and value defined in workspace', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
			userRemote: { value: '2', override: '3' },
			workspace: { value: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user remote target with overrides and value defined in workspace folder', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2', override: '1' },
			userRemote: { value: '2', override: '3' },
			workspace: { value: '3' },
			workspaceFolder: { value: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
	});

	test('updateValue writes into derived user target without overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into derived user target with overrides', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2', override: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', '2');
		assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into derived user target with overrides and value is defined in remote', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2', override: '3' },
			userRemote: { value: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', '2');
		assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into derived user target with overrides and value is defined in workspace', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
			userLocal: { value: '2', override: '3' },
			workspaceValue: { value: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', '2');
		assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into derived user target with overrides and value is defined in workspace folder', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', override: '3' },
			userLocal: { value: '2', override: '3' },
			userRemote: { value: '3' },
			workspaceFolderValue: { value: '3' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', '2');
		assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue writes into derived user target when overridden in default and not in user', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1', override: '3' },
			userLocal: { value: '2' },
			overrideIdentifiers: [language]
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', '2');
		assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
	});

	test('updateValue when not changed', async () => {
		language = 'a';
		configurationValue = {
			default: { value: '1' },
		};
		const resource = URI.file('someFile');

		await testObject.updateValue(resource, 'a', 'b');
		assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, ConfigurationTarget.USER_LOCAL]);
	});

});
