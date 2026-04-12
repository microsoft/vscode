/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IModelService } from '../../../common/services/model.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TextResourceConfigurationService } from '../../../common/services/textResourceConfigurationService.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('TextResourceConfigurationService - Update', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationValue = {};
    let updateArgs;
    const configurationService = new class extends TestConfigurationService {
        inspect() {
            return configurationValue;
        }
        updateValue() {
            updateArgs = [...arguments];
            return Promise.resolve();
        }
    }();
    let language = null;
    let testObject;
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 3 /* ConfigurationTarget.USER_LOCAL */]);
    });
    test('updateValue writes with target and without overrides when no language is defined', async () => {
        const resource = URI.file('someFile');
        await testObject.updateValue(resource, 'a', 'b', 3 /* ConfigurationTarget.USER_LOCAL */);
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 3 /* ConfigurationTarget.USER_LOCAL */]);
    });
    test('updateValue writes into given memory target without overrides', async () => {
        language = 'a';
        configurationValue = {
            default: { value: '1' },
            userLocal: { value: '2' },
            workspaceFolder: { value: '1' },
        };
        const resource = URI.file('someFile');
        await testObject.updateValue(resource, 'a', 'b', 8 /* ConfigurationTarget.MEMORY */);
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 8 /* ConfigurationTarget.MEMORY */]);
    });
    test('updateValue writes into given workspace target without overrides', async () => {
        language = 'a';
        configurationValue = {
            default: { value: '1' },
            userLocal: { value: '2' },
            workspaceFolder: { value: '2' },
        };
        const resource = URI.file('someFile');
        await testObject.updateValue(resource, 'a', 'b', 5 /* ConfigurationTarget.WORKSPACE */);
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 5 /* ConfigurationTarget.WORKSPACE */]);
    });
    test('updateValue writes into given user target without overrides', async () => {
        language = 'a';
        configurationValue = {
            default: { value: '1' },
            userLocal: { value: '2' },
            workspaceFolder: { value: '2' },
        };
        const resource = URI.file('someFile');
        await testObject.updateValue(resource, 'a', 'b', 2 /* ConfigurationTarget.USER */);
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 2 /* ConfigurationTarget.USER */]);
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
        await testObject.updateValue(resource, 'a', 'b', 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 5 /* ConfigurationTarget.WORKSPACE */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 5 /* ConfigurationTarget.WORKSPACE */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 5 /* ConfigurationTarget.WORKSPACE */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 4 /* ConfigurationTarget.USER_REMOTE */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 4 /* ConfigurationTarget.USER_REMOTE */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 4 /* ConfigurationTarget.USER_REMOTE */]);
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
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: language }, 4 /* ConfigurationTarget.USER_REMOTE */]);
    });
    test('updateValue writes into derived user target without overrides', async () => {
        language = 'a';
        configurationValue = {
            default: { value: '1' },
            userLocal: { value: '2' },
        };
        const resource = URI.file('someFile');
        await testObject.updateValue(resource, 'a', 'b');
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 3 /* ConfigurationTarget.USER_LOCAL */]);
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
        assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, 3 /* ConfigurationTarget.USER_LOCAL */]);
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
        assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, 3 /* ConfigurationTarget.USER_LOCAL */]);
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
        assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, 3 /* ConfigurationTarget.USER_LOCAL */]);
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
        assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, 3 /* ConfigurationTarget.USER_LOCAL */]);
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
        assert.deepStrictEqual(updateArgs, ['a', '2', { resource, overrideIdentifier: language }, 3 /* ConfigurationTarget.USER_LOCAL */]);
    });
    test('updateValue when not changed', async () => {
        language = 'a';
        configurationValue = {
            default: { value: '1' },
        };
        const resource = URI.file('someFile');
        await testObject.updateValue(resource, 'a', 'b');
        assert.deepStrictEqual(updateArgs, ['a', 'b', { resource, overrideIdentifier: undefined }, 3 /* ConfigurationTarget.USER_LOCAL */]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDekUsT0FBTyxFQUF1QixxQkFBcUIsRUFBdUIsTUFBTSw0REFBNEQsQ0FBQztBQUM3SSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNoSCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHaEcsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtJQUV2RCxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTlELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxrQkFBa0IsR0FBNkIsRUFBRSxDQUFDO0lBQ3RELElBQUksVUFBaUIsQ0FBQztJQUN0QixNQUFNLG9CQUFvQixHQUFHLElBQUksS0FBTSxTQUFRLHdCQUF3QjtRQUM3RCxPQUFPO1lBQ2YsT0FBTyxrQkFBa0IsQ0FBQztRQUMzQixDQUFDO1FBQ1EsV0FBVztZQUNuQixVQUFVLEdBQUcs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