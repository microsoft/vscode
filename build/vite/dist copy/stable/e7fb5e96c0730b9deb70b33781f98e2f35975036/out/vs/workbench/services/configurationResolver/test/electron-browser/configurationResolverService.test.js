/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { stub } from 'sinon';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { normalize } from '../../../../../base/common/path.js';
import * as platform from '../../../../../base/common/platform.js';
import { isLinux, isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestEditorService, TestQuickInputService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { BaseConfigurationResolverService } from '../../browser/baseConfigurationResolverService.js';
import { ConfigurationResolverExpression } from '../../common/configurationResolverExpression.js';
const mockLineNumber = 10;
class TestEditorServiceWithActiveEditor extends TestEditorService {
    get activeTextEditorControl() {
        return {
            getEditorType() {
                return EditorType.ICodeEditor;
            },
            getSelection() {
                return new Selection(mockLineNumber, 1, mockLineNumber, 10);
            }
        };
    }
    get activeEditor() {
        return {
            get resource() {
                return URI.parse('file:///VSCode/workspaceLocation/file');
            }
        };
    }
}
class TestConfigurationResolverService extends BaseConfigurationResolverService {
}
const nullContext = {
    getAppRoot: () => undefined,
    getExecPath: () => undefined
};
suite('Configuration Resolver Service', () => {
    let configurationResolverService;
    const envVariables = { key1: 'Value for key1', key2: 'Value for key2' };
    // let environmentService: MockWorkbenchEnvironmentService;
    let mockCommandService;
    let editorService;
    let containingWorkspace;
    let workspace;
    let quickInputService;
    let labelService;
    let pathService;
    let extensionService;
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        mockCommandService = new MockCommandService();
        editorService = disposables.add(new TestEditorServiceWithActiveEditor());
        quickInputService = new TestQuickInputService();
        // environmentService = new MockWorkbenchEnvironmentService(envVariables);
        labelService = new MockLabelService();
        pathService = new MockPathService();
        extensionService = new TestExtensionService();
        containingWorkspace = testWorkspace(URI.parse('file:///VSCode/workspaceLocation'));
        workspace = containingWorkspace.folders[0];
        configurationResolverService = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), editorService, new MockInputsConfigurationService(), mockCommandService, new TestContextService(containingWorkspace), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    });
    teardown(() => {
        configurationResolverService = null;
    });
    test('substitute one', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder} xyz'), 'abc /VSCode/workspaceLocation xyz');
        }
    });
    test('does not preserve platform config even when not matched', async () => {
        const obj = {
            program: 'osx.sh',
            windows: {
                program: 'windows.exe'
            },
            linux: {
                program: 'linux.sh'
            }
        };
        const config = await configurationResolverService.resolveAsync(workspace, obj);
        const expected = isWindows ? 'windows.exe' : isMacintosh ? 'osx.sh' : isLinux ? 'linux.sh' : undefined;
        assert.strictEqual(config.windows, undefined);
        assert.strictEqual(config.osx, undefined);
        assert.strictEqual(config.linux, undefined);
        assert.strictEqual(config.program, expected);
    });
    test('apples platform specific config', async () => {
        const expected = isWindows ? 'windows.exe' : isMacintosh ? 'osx.sh' : isLinux ? 'linux.sh' : undefined;
        const obj = {
            windows: {
                program: 'windows.exe'
            },
            osx: {
                program: 'osx.sh'
            },
            linux: {
                program: 'linux.sh'
            }
        };
        const originalObj = JSON.stringify(obj);
        const config = await configurationResolverService.resolveAsync(workspace, obj);
        assert.strictEqual(config.program, expected);
        assert.strictEqual(config.windows, undefined);
        assert.strictEqual(config.osx, undefined);
        assert.strictEqual(config.linux, undefined);
        assert.strictEqual(JSON.stringify(obj), originalObj); // did not mutate original
    });
    test('workspace folder with argument', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc /VSCode/workspaceLocation xyz');
        }
    });
    test('workspace folder with invalid argument', async () => {
        await assert.rejects(async () => await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder:invalidLocation} xyz'));
    });
    test('workspace folder with undefined workspace folder', async () => {
        await assert.rejects(async () => await configurationResolverService.resolveAsync(undefined, 'abc ${workspaceFolder} xyz'));
    });
    test('workspace folder with argument and undefined workspace folder', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(undefined, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(undefined, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc /VSCode/workspaceLocation xyz');
        }
    });
    test('workspace folder with invalid argument and undefined workspace folder', () => {
        assert.rejects(async () => await configurationResolverService.resolveAsync(undefined, 'abc ${workspaceFolder:invalidLocation} xyz'));
    });
    test('workspace root folder name', async () => {
        assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceRootFolderName} xyz'), 'abc workspaceLocation xyz');
    });
    test('current selected line number', async () => {
        assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${lineNumber} xyz'), `abc ${mockLineNumber} xyz`);
    });
    test('relative file', async () => {
        assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${relativeFile} xyz'), 'abc file xyz');
    });
    test('relative file with argument', async () => {
        assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${relativeFile:workspaceLocation} xyz'), 'abc file xyz');
    });
    test('relative file with invalid argument', () => {
        assert.rejects(async () => await configurationResolverService.resolveAsync(workspace, 'abc ${relativeFile:invalidLocation} xyz'));
    });
    test('relative file with undefined workspace folder', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(undefined, 'abc ${relativeFile} xyz'), 'abc \\VSCode\\workspaceLocation\\file xyz');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(undefined, 'abc ${relativeFile} xyz'), 'abc /VSCode/workspaceLocation/file xyz');
        }
    });
    test('relative file with argument and undefined workspace folder', async () => {
        assert.strictEqual(await configurationResolverService.resolveAsync(undefined, 'abc ${relativeFile:workspaceLocation} xyz'), 'abc file xyz');
    });
    test('relative file with invalid argument and undefined workspace folder', () => {
        assert.rejects(async () => await configurationResolverService.resolveAsync(undefined, 'abc ${relativeFile:invalidLocation} xyz'));
    });
    test('substitute many', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation');
        }
    });
    test('substitute one env variable', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder} ${env:key1} xyz'), 'abc \\VSCode\\workspaceLocation Value for key1 xyz');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, 'abc ${workspaceFolder} ${env:key1} xyz'), 'abc /VSCode/workspaceLocation Value for key1 xyz');
        }
    });
    test('substitute many env variable', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2');
        }
    });
    test('disallows nested keys (#77289)', async () => {
        assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${env:key1} ${env:key1${env:key2}}'), 'Value for key1 ');
    });
    test('supports extensionDir', async () => {
        const getExtension = stub(extensionService, 'getExtension');
        getExtension.withArgs('publisher.extId').returns(Promise.resolve({ extensionLocation: URI.file('/some/path') }));
        assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${extensionInstallFolder:publisher.extId}'), URI.file('/some/path').fsPath);
    });
    // test('substitute keys and values in object', () => {
    // 	const myObject = {
    // 		'${workspaceRootFolderName}': '${lineNumber}',
    // 		'hey ${env:key1} ': '${workspaceRootFolderName}'
    // 	};
    // 	assert.deepStrictEqual(configurationResolverService!.resolveAsync(workspace, myObject), {
    // 		'workspaceLocation': `${editorService.mockLineNumber}`,
    // 		'hey Value for key1 ': 'workspaceLocation'
    // 	});
    // });
    test('substitute one env variable using platform case sensitivity', async () => {
        if (platform.isWindows) {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${env:key1} - ${env:Key1}'), 'Value for key1 - Value for key1');
        }
        else {
            assert.strictEqual(await configurationResolverService.resolveAsync(workspace, '${env:key1} - ${env:Key1}'), 'Value for key1 - ');
        }
    });
    test('substitute one configuration variable', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo'
            },
            terminal: {
                integrated: {
                    fontFamily: 'bar'
                }
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} xyz'), 'abc foo xyz');
    });
    test('inlines an array (#245718)', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: ['foo', 'bar']
            },
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} xyz'), 'abc foo,bar xyz');
    });
    test('substitute configuration variable with undefined workspace folder', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo'
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(undefined, 'abc ${config:editor.fontFamily} xyz'), 'abc foo xyz');
    });
    test('substitute many configuration variables', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo'
            },
            terminal: {
                integrated: {
                    fontFamily: 'bar'
                }
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} xyz'), 'abc foo bar xyz');
    });
    test('substitute one env variable and a configuration variable', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo'
            },
            terminal: {
                integrated: {
                    fontFamily: 'bar'
                }
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        if (platform.isWindows) {
            assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} ${workspaceFolder} ${env:key1} xyz'), 'abc foo \\VSCode\\workspaceLocation Value for key1 xyz');
        }
        else {
            assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} ${workspaceFolder} ${env:key1} xyz'), 'abc foo /VSCode/workspaceLocation Value for key1 xyz');
        }
    });
    test('recursively resolve variables', async () => {
        const configurationService = new TestConfigurationService({
            key1: 'key1=${config:key2}',
            key2: 'key2=${config:key3}',
            key3: 'we did it!',
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(workspace, '${config:key1}'), 'key1=key2=we did it!');
    });
    test('substitute many env variable and a configuration variable', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo'
            },
            terminal: {
                integrated: {
                    fontFamily: 'bar'
                }
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        if (platform.isWindows) {
            assert.strictEqual(await service.resolveAsync(workspace, '${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} ${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), 'foo bar \\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2');
        }
        else {
            assert.strictEqual(await service.resolveAsync(workspace, '${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} ${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), 'foo bar /VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2');
        }
    });
    test('mixed types of configuration variables', async () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo',
                lineNumbers: 123,
                insertSpaces: false
            },
            terminal: {
                integrated: {
                    fontFamily: 'bar'
                }
            },
            json: {
                schemas: [
                    {
                        fileMatch: [
                            '/myfile',
                            '/myOtherfile'
                        ],
                        url: 'schemaURL'
                    }
                ]
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} ${config:editor.lineNumbers} ${config:editor.insertSpaces} xyz'), 'abc foo 123 false xyz');
    });
    test('uses original variable as fallback', async () => {
        const configurationService = new TestConfigurationService({
            editor: {}
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.strictEqual(await service.resolveAsync(workspace, 'abc ${unknownVariable} xyz'), 'abc ${unknownVariable} xyz');
        assert.strictEqual(await service.resolveAsync(workspace, 'abc ${env:unknownVariable} xyz'), 'abc  xyz');
    });
    test('configuration variables with invalid accessor', () => {
        const configurationService = new TestConfigurationService({
            editor: {
                fontFamily: 'foo'
            }
        });
        const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${env} xyz'));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${env:} xyz'));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${config} xyz'));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${config:} xyz'));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${config:editor} xyz'));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${config:editor..fontFamily} xyz'));
        assert.rejects(async () => await service.resolveAsync(workspace, 'abc ${config:editor.none.none2} xyz'));
    });
    test('a single command variable', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${command:command1}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        return configurationResolverService.resolveWithInteractionReplace(undefined, configuration).then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'command1-result',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(1, mockCommandService.callCount);
        });
    });
    test('an old style command variable', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${command:commandVariable1}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        const commandVariables = Object.create(null);
        commandVariables['commandVariable1'] = 'command1';
        return configurationResolverService.resolveWithInteractionReplace(undefined, configuration, undefined, commandVariables).then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'command1-result',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(1, mockCommandService.callCount);
        });
    });
    test('multiple new and old-style command variables', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${command:commandVariable1}',
            'pid': '${command:command2}',
            'sourceMaps': false,
            'outDir': 'src/${command:command2}',
            'env': {
                'processId': '__${command:command2}__',
            }
        };
        const commandVariables = Object.create(null);
        commandVariables['commandVariable1'] = 'command1';
        return configurationResolverService.resolveWithInteractionReplace(undefined, configuration, undefined, commandVariables).then(result => {
            const expected = {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'command1-result',
                'pid': 'command2-result',
                'sourceMaps': false,
                'outDir': 'src/command2-result',
                'env': {
                    'processId': '__command2-result__',
                }
            };
            assert.deepStrictEqual(Object.keys(result), Object.keys(expected));
            Object.keys(result).forEach(property => {
                const expectedProperty = expected[property];
                if (isObject(result[property])) {
                    assert.deepStrictEqual({ ...result[property] }, expectedProperty);
                }
                else {
                    assert.deepStrictEqual(result[property], expectedProperty);
                }
            });
            assert.strictEqual(2, mockCommandService.callCount);
        });
    });
    test('a command variable that relies on resolved env vars', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${command:commandVariable1}',
            'value': '${env:key1}'
        };
        const commandVariables = Object.create(null);
        commandVariables['commandVariable1'] = 'command1';
        return configurationResolverService.resolveWithInteractionReplace(undefined, configuration, undefined, commandVariables).then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'Value for key1',
                'value': 'Value for key1'
            });
            assert.strictEqual(1, mockCommandService.callCount);
        });
    });
    test('a single prompt input variable', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${input:input1}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'resolvedEnterinput1',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(0, mockCommandService.callCount);
        });
    });
    test('a single pick input variable', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${input:input2}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'selectedPick',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(0, mockCommandService.callCount);
        });
    });
    test('a single command input variable', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${input:input4}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'arg for command',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(1, mockCommandService.callCount);
        });
    });
    test('several input variables and command', () => {
        const configuration = {
            'name': '${input:input3}',
            'type': '${command:command1}',
            'request': '${input:input1}',
            'processId': '${input:input2}',
            'command': '${input:input4}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'resolvedEnterinput3',
                'type': 'command1-result',
                'request': 'resolvedEnterinput1',
                'processId': 'selectedPick',
                'command': 'arg for command',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(2, mockCommandService.callCount);
        });
    });
    test('input variable with undefined workspace folder', () => {
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${input:input1}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        return configurationResolverService.resolveWithInteractionReplace(undefined, configuration, 'tasks').then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': 'Attach to Process',
                'type': 'node',
                'request': 'attach',
                'processId': 'resolvedEnterinput1',
                'port': 5858,
                'sourceMaps': false,
                'outDir': null
            });
            assert.strictEqual(0, mockCommandService.callCount);
        });
    });
    test('contributed variable', () => {
        const buildTask = 'npm: compile';
        const variable = 'defaultBuildTask';
        const configuration = {
            'name': '${' + variable + '}',
        };
        configurationResolverService.contributeVariable(variable, async () => { return buildTask; });
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration).then(result => {
            assert.deepStrictEqual({ ...result }, {
                'name': `${buildTask}`
            });
        });
    });
    test('contributed taskVar variable', () => {
        const url = 'http://localhost:5678';
        const variable = 'taskVar:componentExplorerUrl';
        const configuration = {
            'url': '${taskVar:componentExplorerUrl}/___explorer',
        };
        configurationResolverService.contributeVariable(variable, async () => { return url; });
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration).then(result => {
            assert.deepStrictEqual({ ...result }, {
                'url': `${url}/___explorer`
            });
        });
    });
    test('resolveWithEnvironment', async () => {
        const env = {
            'VAR_1': 'VAL_1',
            'VAR_2': 'VAL_2'
        };
        const configuration = 'echo ${env:VAR_1}${env:VAR_2}';
        const resolvedResult = await configurationResolverService.resolveWithEnvironment({ ...env }, undefined, configuration);
        assert.deepStrictEqual(resolvedResult, 'echo VAL_1VAL_2');
    });
    test('substitution in object key', async () => {
        const configuration = {
            'name': 'Test',
            'mappings': {
                'pos1': 'value1',
                '${workspaceFolder}/test1': '${workspaceFolder}/test2',
                'pos3': 'value3'
            }
        };
        return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {
            if (platform.isWindows) {
                assert.deepStrictEqual({ ...result }, {
                    'name': 'Test',
                    'mappings': {
                        'pos1': 'value1',
                        '\\VSCode\\workspaceLocation/test1': '\\VSCode\\workspaceLocation/test2',
                        'pos3': 'value3'
                    }
                });
            }
            else {
                assert.deepStrictEqual({ ...result }, {
                    'name': 'Test',
                    'mappings': {
                        'pos1': 'value1',
                        '/VSCode/workspaceLocation/test1': '/VSCode/workspaceLocation/test2',
                        'pos3': 'value3'
                    }
                });
            }
            assert.strictEqual(0, mockCommandService.callCount);
        });
    });
    test('canceled input', async () => {
        stub(quickInputService, 'input').resolves(undefined);
        const configuration = {
            'name': 'Attach to Process',
            'type': 'node',
            'request': 'attach',
            'processId': '${input:input1}',
            'port': 5858,
            'sourceMaps': false,
            'outDir': null
        };
        const result = await configurationResolverService.resolveWithInteractionReplace(workspace, configuration, 'tasks');
        assert.strictEqual(result, undefined);
    });
});
class MockCommandService {
    constructor() {
        this.callCount = 0;
        this.onWillExecuteCommand = () => Disposable.None;
        this.onDidExecuteCommand = () => Disposable.None;
    }
    executeCommand(commandId, ...args) {
        this.callCount++;
        let result = `${commandId}-result`;
        if (args.length >= 1) {
            if (args[0] && args[0].value) {
                result = args[0].value;
            }
        }
        return Promise.resolve(result);
    }
}
class MockLabelService {
    constructor() {
        this.onDidChangeFormatters = new Emitter().event;
    }
    getUriLabel(resource, options) {
        return normalize(resource.fsPath);
    }
    getUriBasenameLabel(resource) {
        throw new Error('Method not implemented.');
    }
    getWorkspaceLabel(workspace, options) {
        throw new Error('Method not implemented.');
    }
    getHostLabel(scheme, authority) {
        throw new Error('Method not implemented.');
    }
    getHostTooltip() {
        throw new Error('Method not implemented.');
    }
    getSeparator(scheme, authority) {
        throw new Error('Method not implemented.');
    }
    registerFormatter(formatter) {
        throw new Error('Method not implemented.');
    }
    registerCachedFormatter(formatter) {
        throw new Error('Method not implemented.');
    }
}
class MockPathService {
    constructor() {
        this.defaultUriScheme = Schemas.file;
    }
    get path() {
        throw new Error('Property not implemented');
    }
    fileURI(path) {
        throw new Error('Method not implemented.');
    }
    userHome(options) {
        const uri = URI.file('c:\\users\\username');
        return options?.preferLocal ? uri : Promise.resolve(uri);
    }
    hasValidBasename(resource, arg2, name) {
        throw new Error('Method not implemented.');
    }
}
class MockInputsConfigurationService extends TestConfigurationService {
    getValue(arg1, arg2) {
        let configuration;
        if (arg1 === 'tasks') {
            configuration = {
                inputs: [
                    {
                        id: 'input1',
                        type: 'promptString',
                        description: 'Enterinput1',
                        default: 'default input1'
                    },
                    {
                        id: 'input2',
                        type: 'pickString',
                        description: 'Enterinput1',
                        default: 'option2',
                        options: ['option1', 'option2', 'option3']
                    },
                    {
                        id: 'input3',
                        type: 'promptString',
                        description: 'Enterinput3',
                        default: 'default input3',
                        provide: true,
                        password: true
                    },
                    {
                        id: 'input4',
                        type: 'command',
                        command: 'command1',
                        args: {
                            value: 'arg for command'
                        }
                    }
                ]
            };
        }
        return configuration;
    }
    inspect(key, overrides) {
        return {
            value: undefined,
            defaultValue: undefined,
            userValue: undefined,
            overrideIdentifiers: []
        };
    }
}
suite('ConfigurationResolverExpression', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parse empty object', () => {
        const expr = ConfigurationResolverExpression.parse({});
        assert.strictEqual(Array.from(expr.unresolved()).length, 0);
        assert.deepStrictEqual(expr.toObject(), {});
    });
    test('parse simple string', () => {
        const expr = ConfigurationResolverExpression.parse({ value: '${env:HOME}' });
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 1);
        assert.strictEqual(unresolved[0].name, 'env');
        assert.strictEqual(unresolved[0].arg, 'HOME');
    });
    test('parse string with argument and colon', () => {
        const expr = ConfigurationResolverExpression.parse({ value: '${config:path:to:value}' });
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 1);
        assert.strictEqual(unresolved[0].name, 'config');
        assert.strictEqual(unresolved[0].arg, 'path:to:value');
    });
    test('parse object with nested variables', () => {
        const expr = ConfigurationResolverExpression.parse({
            name: '${env:USERNAME}',
            path: '${env:HOME}/folder',
            settings: {
                value: '${config:path}'
            },
            array: ['${env:TERM}', { key: '${env:KEY}' }]
        });
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 5);
        assert.deepStrictEqual(unresolved.map(r => r.name).sort(), ['config', 'env', 'env', 'env', 'env']);
    });
    test('resolve and get result', () => {
        const expr = ConfigurationResolverExpression.parse({
            name: '${env:USERNAME}',
            path: '${env:HOME}/folder'
        });
        expr.resolve({ inner: 'env:USERNAME', id: '${env:USERNAME}', name: 'env', arg: 'USERNAME' }, 'testuser');
        expr.resolve({ inner: 'env:HOME', id: '${env:HOME}', name: 'env', arg: 'HOME' }, '/home/testuser');
        assert.deepStrictEqual(expr.toObject(), {
            name: 'testuser',
            path: '/home/testuser/folder'
        });
    });
    test('keeps unresolved variables', () => {
        const expr = ConfigurationResolverExpression.parse({
            name: '${env:USERNAME}'
        });
        assert.deepStrictEqual(expr.toObject(), {
            name: '${env:USERNAME}'
        });
    });
    test('deduplicates identical variables', () => {
        const expr = ConfigurationResolverExpression.parse({
            first: '${env:HOME}',
            second: '${env:HOME}'
        });
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 1);
        assert.strictEqual(unresolved[0].name, 'env');
        assert.strictEqual(unresolved[0].arg, 'HOME');
        expr.resolve(unresolved[0], '/home/user');
        assert.deepStrictEqual(expr.toObject(), {
            first: '/home/user',
            second: '/home/user'
        });
    });
    test('handles root string value', () => {
        const expr = ConfigurationResolverExpression.parse('abc ${env:HOME} xyz');
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 1);
        assert.strictEqual(unresolved[0].name, 'env');
        assert.strictEqual(unresolved[0].arg, 'HOME');
        expr.resolve(unresolved[0], '/home/user');
        assert.strictEqual(expr.toObject(), 'abc /home/user xyz');
    });
    test('handles root string value with multiple variables', () => {
        const expr = ConfigurationResolverExpression.parse('${env:HOME}/folder${env:SHELL}');
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 2);
        expr.resolve({ id: '${env:HOME}', inner: 'env:HOME', name: 'env', arg: 'HOME' }, '/home/user');
        expr.resolve({ id: '${env:SHELL}', inner: 'env:SHELL', name: 'env', arg: 'SHELL' }, '/bin/bash');
        assert.strictEqual(expr.toObject(), '/home/user/folder/bin/bash');
    });
    test('handles root string with escaped variables', () => {
        const expr = ConfigurationResolverExpression.parse('abc ${env:HOME${env:USER}} xyz');
        const unresolved = Array.from(expr.unresolved());
        assert.strictEqual(unresolved.length, 1);
        assert.strictEqual(unresolved[0].name, 'env');
        assert.strictEqual(unresolved[0].arg, 'HOME${env:USER}');
    });
    test('resolves nested values', () => {
        const expr = ConfigurationResolverExpression.parse({
            name: '${env:REDIRECTED}',
            'key that is ${env:REDIRECTED}': 'cool!',
        });
        for (const r of expr.unresolved()) {
            if (r.arg === 'REDIRECTED') {
                expr.resolve(r, 'username: ${env:USERNAME}');
            }
            else if (r.arg === 'USERNAME') {
                expr.resolve(r, 'testuser');
            }
        }
        assert.deepStrictEqual(expr.toObject(), {
            name: 'username: testuser',
            'key that is username: testuser': 'cool!'
        });
    });
    test('resolves nested values 2 (#245798)', () => {
        const expr = ConfigurationResolverExpression.parse({
            env: {
                SITE: '${input:site}',
                TLD: '${input:tld}',
                HOST: '${input:host}',
            },
        });
        for (const r of expr.unresolved()) {
            if (r.arg === 'site') {
                expr.resolve(r, 'example');
            }
            else if (r.arg === 'tld') {
                expr.resolve(r, 'com');
            }
            else if (r.arg === 'host') {
                expr.resolve(r, 'local.${input:site}.${input:tld}');
            }
        }
        assert.deepStrictEqual(expr.toObject(), {
            env: {
                SITE: 'example',
                TLD: 'com',
                HOST: 'local.example.com'
            }
        });
    });
    test('out-of-order key resolution (#248550)', () => {
        const expr = ConfigurationResolverExpression.parse({
            '${input:key}': '${input:value}',
        });
        for (const r of expr.unresolved()) {
            if (r.arg === 'key') {
                expr.resolve(r, 'the-key');
            }
        }
        for (const r of expr.unresolved()) {
            if (r.arg === 'value') {
                expr.resolve(r, 'the-value');
            }
        }
        assert.deepStrictEqual(expr.toObject(), {
            'the-key': 'the-value'
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBQzdCLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBUyxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN0RSxPQUFPLEtBQUssUUFBUSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzNFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUcxRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUl6SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFHaEksT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFckcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFbEcsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0saUNBQWtDLFNBQVEsaUJBQWlCO0lBQ2hFLElBQWEsdUJBQXVCO1FBQ25DLE9BQU87WUFDTixhQUFhO2dCQUNaLE9BQU8sVUFBVSxDQUFDLFdBQVcsQ0FBQztZQUMvQixDQUFDO1lBQ0QsWUFBWTtnQkFDWCxPQUFPLElBQUksU0FBUyxDQUFDLGNBQWMsRUFBRSxDQUFDLEVBQUUsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdELENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUNELElBQWEsWUFBWTtRQUN4QixPQUFPO1lBQ04sSUFBSSxRQUFRO2dCQUNYLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1lBQzNELENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsTUFBTSxnQ0FBaUMsU0FBUSxnQ0FBZ0M7Q0FFOUU7QUFFRCxNQUFNLFdBQVcsR0FBRztJQUNuQixVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztJQUMzQixXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztDQUM1QixDQUFDO0FBRUYsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM1QyxJQUFJLDRCQUFrRSxDQUFDO0lBQ3ZFLE1BQU0sWUFBWSxHQUE4QixFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztJQUNuRywyREFBMkQ7SUFDM0QsSUFBSSxrQkFBc0MsQ0FBQztJQUMzQyxJQUFJLGFBQWdELENBQUM7SUFDckQsSUFBSSxtQkFBOEIsQ0FBQztJQUNuQyxJQUFJLFNBQTJCLENBQUM7SUFDaEMsSUFBSSxpQkFBd0MsQ0FBQztJQUM3QyxJQUFJLFlBQThCLENBQUM7SUFDbkMsSUFBSSxXQUE0QixDQUFDO0lBQ2pDLElBQUksZ0JBQW1DLENBQUM7SUFFeEMsTUFBTSxXQUFXLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUU5RCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysa0JBQWtCLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQzlDLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUNBQWlDLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLGlCQUFpQixHQUFHLElBQUkscUJBQXFCLEVBQUUsQ0FBQztRQUNoRCwwRUFBMEU7UUFDMUUsWUFBWSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QyxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxnQkFBZ0IsR0FBRyxJQUFJLG9CQUFvQixFQUFFLENBQUM7UUFDOUMsbUJBQW1CLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO1FBQ25GLFNBQVMsR0FBRyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsNEJBQTRCLEdBQUcsSUFBSSxnQ0FBZ0MsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSw4QkFBOEIsRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksa0JBQWtCLENBQUMsbUJBQW1CLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNsVixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYiw0QkFBNEIsR0FBRyxJQUFJLENBQUM7SUFDckMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDakMsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsNEJBQTRCLENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1FBQ3RKLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsNEJBQTRCLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3BKLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRSxNQUFNLEdBQUcsR0FBRztZQUNYLE9BQU8sRUFBRSxRQUFRO1lBQ2pCLE9BQU8sRUFBRTtnQkFDUixPQUFPLEVBQUUsYUFBYTthQUN0QjtZQUNELEtBQUssRUFBRTtnQkFDTixPQUFPLEVBQUUsVUFBVTthQUNuQjtTQUNELENBQUM7UUFDRixNQUFNLE1BQU0sR0FBUSxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFckYsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRXZHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUM5QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdkcsTUFBTSxHQUFHLEdBQUc7WUFDWCxPQUFPLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLGFBQWE7YUFDdEI7WUFDRCxHQUFHLEVBQUU7Z0JBQ0osT0FBTyxFQUFFLFFBQVE7YUFDakI7WUFDRCxLQUFLLEVBQUU7Z0JBQ04sT0FBTyxFQUFFLFVBQVU7YUFDbkI7U0FDRCxDQUFDO1FBQ0YsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxNQUFNLE1BQU0sR0FBUSxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFckYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtJQUNqRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRCxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSw4Q0FBOEMsQ0FBQyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7UUFDeEssQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSw4Q0FBOEMsQ0FBQyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7UUFDdEssQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pELE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDLENBQUM7SUFDN0ksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkUsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUMsQ0FBQztJQUM3SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrREFBK0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoRixJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSw4Q0FBOEMsQ0FBQyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7UUFDeEssQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSw4Q0FBOEMsQ0FBQyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7UUFDdEssQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVFQUF1RSxFQUFFLEdBQUcsRUFBRTtRQUNsRixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLDRDQUE0QyxDQUFDLENBQUMsQ0FBQztJQUN2SSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxvQ0FBb0MsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLENBQUM7SUFDcEosQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEJBQThCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsdUJBQXVCLENBQUMsRUFBRSxPQUFPLGNBQWMsTUFBTSxDQUFDLENBQUM7SUFDdkksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLHlCQUF5QixDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDNUgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsMkNBQTJDLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUM5SSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDLENBQUM7SUFDcEksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEUsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUseUJBQXlCLENBQUMsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1FBQ3pKLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUseUJBQXlCLENBQUMsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RKLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0REFBNEQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3RSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSwyQ0FBMkMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQzlJLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9FQUFvRSxFQUFFLEdBQUcsRUFBRTtRQUMvRSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLHlDQUF5QyxDQUFDLENBQUMsQ0FBQztJQUNwSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsQyxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSx5Q0FBeUMsQ0FBQyxFQUFFLDJEQUEyRCxDQUFDLENBQUM7UUFDekwsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSx5Q0FBeUMsQ0FBQyxFQUFFLHVEQUF1RCxDQUFDLENBQUM7UUFDckwsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlDLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLHdDQUF3QyxDQUFDLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztRQUNqTCxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLHdDQUF3QyxDQUFDLEVBQUUsa0RBQWtELENBQUMsQ0FBQztRQUMvSyxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEJBQThCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0MsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsbUVBQW1FLENBQUMsRUFBRSwyRkFBMkYsQ0FBQyxDQUFDO1FBQ25QLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsbUVBQW1FLENBQUMsRUFBRSx1RkFBdUYsQ0FBQyxDQUFDO1FBQy9PLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sNEJBQTZCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxvQ0FBb0MsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDMUksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQzVELFlBQVksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQTJCLENBQUMsQ0FBQyxDQUFDO1FBRTFJLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSw0QkFBNkIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLDJDQUEyQyxDQUFDLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3SixDQUFDLENBQUMsQ0FBQztJQUVILHVEQUF1RDtJQUN2RCxzQkFBc0I7SUFDdEIsbURBQW1EO0lBQ25ELHFEQUFxRDtJQUNyRCxNQUFNO0lBQ04sNkZBQTZGO0lBQzdGLDREQUE0RDtJQUM1RCwrQ0FBK0M7SUFDL0MsT0FBTztJQUNQLE1BQU07SUFHTixJQUFJLENBQUMsNkRBQTZELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDOUUsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsMkJBQTJCLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ2pKLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLDRCQUE2QixDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsMkJBQTJCLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ25JLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4RCxNQUFNLG9CQUFvQixHQUEwQixJQUFJLHdCQUF3QixDQUFDO1lBQ2hGLE1BQU0sRUFBRTtnQkFDUCxVQUFVLEVBQUUsS0FBSzthQUNqQjtZQUNELFFBQVEsRUFBRTtnQkFDVCxVQUFVLEVBQUU7b0JBQ1gsVUFBVSxFQUFFLEtBQUs7aUJBQ2pCO2FBQ0Q7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFnQyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFVLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxxQ0FBcUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ2pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdDLE1BQU0sb0JBQW9CLEdBQTBCLElBQUksd0JBQXdCLENBQUM7WUFDaEYsTUFBTSxFQUFFO2dCQUNQLFVBQVUsRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUM7YUFDMUI7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFnQyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFVLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxxQ0FBcUMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDckgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUVBQW1FLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDcEYsTUFBTSxvQkFBb0IsR0FBMEIsSUFBSSx3QkFBd0IsQ0FBQztZQUNoRixNQUFNLEVBQUU7Z0JBQ1AsVUFBVSxFQUFFLEtBQUs7YUFDakI7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFnQyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFVLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxxQ0FBcUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ2pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFELE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQztZQUN6RCxNQUFNLEVBQUU7Z0JBQ1AsVUFBVSxFQUFFLEtBQUs7YUFDakI7WUFDRCxRQUFRLEVBQUU7Z0JBQ1QsVUFBVSxFQUFFO29CQUNYLFVBQVUsRUFBRSxLQUFLO2lCQUNqQjthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxPQUFPLEdBQUcsSUFBSSxnQ0FBZ0MsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUNBQWlDLEVBQUUsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLElBQUksa0JBQWtCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxVSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsOEVBQThFLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQzlKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzNFLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQztZQUN6RCxNQUFNLEVBQUU7Z0JBQ1AsVUFBVSxFQUFFLEtBQUs7YUFDakI7WUFDRCxRQUFRLEVBQUU7Z0JBQ1QsVUFBVSxFQUFFO29CQUNYLFVBQVUsRUFBRSxLQUFLO2lCQUNqQjthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxPQUFPLEdBQUcsSUFBSSxnQ0FBZ0MsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUNBQWlDLEVBQUUsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLElBQUksa0JBQWtCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxVSxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsb0VBQW9FLENBQUMsRUFBRSx3REFBd0QsQ0FBQyxDQUFDO1FBQzNMLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLG9FQUFvRSxDQUFDLEVBQUUsc0RBQXNELENBQUMsQ0FBQztRQUN6TCxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0JBQStCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixDQUFDO1lBQ3pELElBQUksRUFBRSxxQkFBcUI7WUFDM0IsSUFBSSxFQUFFLHFCQUFxQjtZQUMzQixJQUFJLEVBQUUsWUFBWTtTQUNsQixDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFnQyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFVLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUM7SUFDckcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkRBQTJELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDNUUsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixDQUFDO1lBQ3pELE1BQU0sRUFBRTtnQkFDUCxVQUFVLEVBQUUsS0FBSzthQUNqQjtZQUNELFFBQVEsRUFBRTtnQkFDVCxVQUFVLEVBQUU7b0JBQ1gsVUFBVSxFQUFFLEtBQUs7aUJBQ2pCO2FBQ0Q7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFnQyxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFVLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSx3SUFBd0ksQ0FBQyxFQUFFLG1HQUFtRyxDQUFDLENBQUM7UUFDMVMsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsd0lBQXdJLENBQUMsRUFBRSwrRkFBK0YsQ0FBQyxDQUFDO1FBQ3RTLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RCxNQUFNLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLENBQUM7WUFDekQsTUFBTSxFQUFFO2dCQUNQLFVBQVUsRUFBRSxLQUFLO2dCQUNqQixXQUFXLEVBQUUsR0FBRztnQkFDaEIsWUFBWSxFQUFFLEtBQUs7YUFDbkI7WUFDRCxRQUFRLEVBQUU7Z0JBQ1QsVUFBVSxFQUFFO29CQUNYLFVBQVUsRUFBRSxLQUFLO2lCQUNqQjthQUNEO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLE9BQU8sRUFBRTtvQkFDUjt3QkFDQyxTQUFTLEVBQUU7NEJBQ1YsU0FBUzs0QkFDVCxjQUFjO3lCQUNkO3dCQUNELEdBQUcsRUFBRSxXQUFXO3FCQUNoQjtpQkFDRDthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxPQUFPLEdBQUcsSUFBSSxnQ0FBZ0MsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUNBQWlDLEVBQUUsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLElBQUksa0JBQWtCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxVSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsZ0dBQWdHLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3RMLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3JELE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQztZQUN6RCxNQUFNLEVBQUUsRUFBRTtTQUNWLENBQUMsQ0FBQztRQUVILE1BQU0sT0FBTyxHQUFHLElBQUksZ0NBQWdDLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlDQUFpQyxFQUFFLENBQUMsRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLGtCQUFrQixFQUFFLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMVUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztRQUN0SCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsZ0NBQWdDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN6RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7UUFDMUQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixDQUFDO1lBQ3pELE1BQU0sRUFBRTtnQkFDUCxVQUFVLEVBQUUsS0FBSzthQUNqQjtTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sT0FBTyxHQUFHLElBQUksZ0NBQWdDLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlDQUFpQyxFQUFFLENBQUMsRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLGtCQUFrQixFQUFFLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMVUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxNQUFNLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUNyRixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxNQUFNLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUM5RixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDLENBQUM7UUFDMUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUscUNBQXFDLENBQUMsQ0FBQyxDQUFDO0lBQzFHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUV0QyxNQUFNLGFBQWEsR0FBRztZQUNyQixNQUFNLEVBQUUsbUJBQW1CO1lBQzNCLE1BQU0sRUFBRSxNQUFNO1lBQ2QsU0FBUyxFQUFFLFFBQVE7WUFDbkIsV0FBVyxFQUFFLHFCQUFxQjtZQUNsQyxNQUFNLEVBQUUsSUFBSTtZQUNaLFlBQVksRUFBRSxLQUFLO1lBQ25CLFFBQVEsRUFBRSxJQUFJO1NBQ2QsQ0FBQztRQUVGLE9BQU8sNEJBQTZCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMxRyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsRUFBRTtnQkFDckMsTUFBTSxFQUFFLG1CQUFtQjtnQkFDM0IsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsU0FBUyxFQUFFLFFBQVE7Z0JBQ25CLFdBQVcsRUFBRSxpQkFBaUI7Z0JBQzlCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFlBQVksRUFBRSxLQUFLO2dCQUNuQixRQUFRLEVBQUUsSUFBSTthQUNkLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO1FBQzFDLE1BQU0sYUFBYSxHQUFHO1lBQ3JCLE1BQU0sRUFBRSxtQkFBbUI7WUFDM0IsTUFBTSxFQUFFLE1BQU07WUFDZCxTQUFTLEVBQUUsUUFBUTtZQUNuQixXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLE1BQU0sRUFBRSxJQUFJO1lBQ1osWUFBWSxFQUFFLEtBQUs7WUFDbkIsUUFBUSxFQUFFLElBQUk7U0FDZCxDQUFDO1FBQ0YsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLEdBQUcsVUFBVSxDQUFDO1FBRWxELE9BQU8sNEJBQTZCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDdkksTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLEVBQUU7Z0JBQ3JDLE1BQU0sRUFBRSxtQkFBbUI7Z0JBQzNCLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFNBQVMsRUFBRSxRQUFRO2dCQUNuQixXQUFXLEVBQUUsaUJBQWlCO2dCQUM5QixNQUFNLEVBQUUsSUFBSTtnQkFDWixZQUFZLEVBQUUsS0FBSztnQkFDbkIsUUFBUSxFQUFFLElBQUk7YUFDZCxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtRQUV6RCxNQUFNLGFBQWEsR0FBRztZQUNyQixNQUFNLEVBQUUsbUJBQW1CO1lBQzNCLE1BQU0sRUFBRSxNQUFNO1lBQ2QsU0FBUyxFQUFFLFFBQVE7WUFDbkIsV0FBVyxFQUFFLDZCQUE2QjtZQUMxQyxLQUFLLEVBQUUscUJBQXFCO1lBQzVCLFlBQVksRUFBRSxLQUFLO1lBQ25CLFFBQVEsRUFBRSx5QkFBeUI7WUFDbkMsS0FBSyxFQUFFO2dCQUNOLFdBQVcsRUFBRSx5QkFBeUI7YUFDdEM7U0FDRCxDQUFDO1FBQ0YsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLEdBQUcsVUFBVSxDQUFDO1FBRWxELE9BQU8sNEJBQTZCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDdkksTUFBTSxRQUFRLEdBQUc7Z0JBQ2hCLE1BQU0sRUFBRSxtQkFBbUI7Z0JBQzNCLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFNBQVMsRUFBRSxRQUFRO2dCQUNuQixXQUFXLEVBQUUsaUJBQWlCO2dCQUM5QixLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixZQUFZLEVBQUUsS0FBSztnQkFDbkIsUUFBUSxFQUFFLHFCQUFxQjtnQkFDL0IsS0FBSyxFQUFFO29CQUNOLFdBQVcsRUFBRSxxQkFBcUI7aUJBQ2xDO2FBQ0QsQ0FBQztZQUVGLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDbkUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQ3RDLE1BQU0sZ0JBQWdCLEdBQUksUUFBb0MsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekUsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztnQkFDbkUsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUM7Z0JBQzVELENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFO1FBRWhFLE1BQU0sYUFBYSxHQUFHO1lBQ3JCLE1BQU0sRUFBRSxtQkFBbUI7WUFDM0IsTUFBTSxFQUFFLE1BQU07WUFDZCxTQUFTLEVBQUUsUUFBUTtZQUNuQixXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLE9BQU8sRUFBRSxhQUFhO1NBQ3RCLENBQUM7UUFDRixNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsR0FBRyxVQUFVLENBQUM7UUFFbEQsT0FBTyw0QkFBNkIsQ0FBQyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUV2SSxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsRUFBRTtnQkFDckMsTUFBTSxFQUFFLG1CQUFtQjtnQkFDM0IsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsU0FBUyxFQUFFLFFBQVE7Z0JBQ25CLFdBQVcsRUFBRSxnQkFBZ0I7Z0JBQzdCLE9BQU8sRUFBRSxnQkFBZ0I7YUFDekIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFFM0MsTUFBTSxhQUFhLEdBQUc7WUFDckIsTUFBTSxFQUFFLG1CQUFtQjtZQUMzQixNQUFNLEVBQUUsTUFBTTtZQUNkLFNBQVMsRUFBRSxRQUFRO1lBQ25CLFdBQVcsRUFBRSxpQkFBaUI7WUFDOUIsTUFBTSxFQUFFLElBQUk7WUFDWixZQUFZLEVBQUUsS0FBSztZQUNuQixRQUFRLEVBQUUsSUFBSTtTQUNkLENBQUM7UUFFRixPQUFPLDRCQUE2QixDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBRW5ILE1BQU0sQ0FBQyxlQUFlLENBQUMsRUFBRSxHQUFHLE1BQU0sRUFBRSxFQUFFO2dCQUNyQyxNQUFNLEVBQUUsbUJBQW1CO2dCQUMzQixNQUFNLEVBQUUsTUFBTTtnQkFDZCxTQUFTLEVBQUUsUUFBUTtnQkFDbkIsV0FBVyxFQUFFLHFCQUFxQjtnQkFDbEMsTUFBTSxFQUFFLElBQUk7Z0JBQ1osWUFBWSxFQUFFLEtBQUs7Z0JBQ25CLFFBQVEsRUFBRSxJQUFJO2FBQ2QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7UUFFekMsTUFBTSxhQUFhLEdBQUc7WUFDckIsTUFBTSxFQUFFLG1CQUFtQjtZQUMzQixNQUFNLEVBQUUsTUFBTTtZQUNkLFNBQVMsRUFBRSxRQUFRO1lBQ25CLFdBQVcsRUFBRSxpQkFBaUI7WUFDOUIsTUFBTSxFQUFFLElBQUk7WUFDWixZQUFZLEVBQUUsS0FBSztZQUNuQixRQUFRLEVBQUUsSUFBSTtTQUNkLENBQUM7UUFFRixPQUFPLDRCQUE2QixDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBRW5ILE1BQU0sQ0FBQyxlQUFlLENBQUMsRUFBRSxHQUFHLE1BQU0sRUFBRSxFQUFFO2dCQUNyQyxNQUFNLEVBQUUsbUJBQW1CO2dCQUMzQixNQUFNLEVBQUUsTUFBTTtnQkFDZCxTQUFTLEVBQUUsUUFBUTtnQkFDbkIsV0FBVyxFQUFFLGNBQWM7Z0JBQzNCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFlBQVksRUFBRSxLQUFLO2dCQUNuQixRQUFRLEVBQUUsSUFBSTthQUNkLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFO1FBRTVDLE1BQU0sYUFBYSxHQUFHO1lBQ3JCLE1BQU0sRUFBRSxtQkFBbUI7WUFDM0IsTUFBTSxFQUFFLE1BQU07WUFDZCxTQUFTLEVBQUUsUUFBUTtZQUNuQixXQUFXLEVBQUUsaUJBQWlCO1lBQzlCLE1BQU0sRUFBRSxJQUFJO1lBQ1osWUFBWSxFQUFFLEtBQUs7WUFDbkIsUUFBUSxFQUFFLElBQUk7U0FDZCxDQUFDO1FBRUYsT0FBTyw0QkFBNkIsQ0FBQyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUVuSCxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsRUFBRTtnQkFDckMsTUFBTSxFQUFFLG1CQUFtQjtnQkFDM0IsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsU0FBUyxFQUFFLFFBQVE7Z0JBQ25CLFdBQVcsRUFBRSxpQkFBaUI7Z0JBQzlCLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFlBQVksRUFBRSxLQUFLO2dCQUNuQixRQUFRLEVBQUUsSUFBSTthQUNkLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFO1FBRWhELE1BQU0sYUFBYSxHQUFHO1lBQ3JCLE1BQU0sRUFBRSxpQkFBaUI7WUFDekIsTUFBTSxFQUFFLHFCQUFxQjtZQUM3QixTQUFTLEVBQUUsaUJBQWlCO1lBQzVCLFdBQVcsRUFBRSxpQkFBaUI7WUFDOUIsU0FBUyxFQUFFLGlCQUFpQjtZQUM1QixNQUFNLEVBQUUsSUFBSTtZQUNaLFlBQVksRUFBRSxLQUFLO1lBQ25CLFFBQVEsRUFBRSxJQUFJO1NBQ2QsQ0FBQztRQUVGLE9BQU8sNEJBQTZCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFFbkgsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLEVBQUU7Z0JBQ3JDLE1BQU0sRUFBRSxxQkFBcUI7Z0JBQzdCLE1BQU0sRUFBRSxpQkFBaUI7Z0JBQ3pCLFNBQVMsRUFBRSxxQkFBcUI7Z0JBQ2hDLFdBQVcsRUFBRSxjQUFjO2dCQUMzQixTQUFTLEVBQUUsaUJBQWlCO2dCQUM1QixNQUFNLEVBQUUsSUFBSTtnQkFDWixZQUFZLEVBQUUsS0FBSztnQkFDbkIsUUFBUSxFQUFFLElBQUk7YUFDZCxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtRQUUzRCxNQUFNLGFBQWEsR0FBRztZQUNyQixNQUFNLEVBQUUsbUJBQW1CO1lBQzNCLE1BQU0sRUFBRSxNQUFNO1lBQ2QsU0FBUyxFQUFFLFFBQVE7WUFDbkIsV0FBVyxFQUFFLGlCQUFpQjtZQUM5QixNQUFNLEVBQUUsSUFBSTtZQUNaLFlBQVksRUFBRSxLQUFLO1lBQ25CLFFBQVEsRUFBRSxJQUFJO1NBQ2QsQ0FBQztRQUVGLE9BQU8sNEJBQTZCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFFbkgsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLEVBQUU7Z0JBQ3JDLE1BQU0sRUFBRSxtQkFBbUI7Z0JBQzNCLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFNBQVMsRUFBRSxRQUFRO2dCQUNuQixXQUFXLEVBQUUscUJBQXFCO2dCQUNsQyxNQUFNLEVBQUUsSUFBSTtnQkFDWixZQUFZLEVBQUUsS0FBSztnQkFDbkIsUUFBUSxFQUFFLElBQUk7YUFDZCxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNqQyxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUM7UUFDakMsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7UUFDcEMsTUFBTSxhQUFhLEdBQUc7WUFDckIsTUFBTSxFQUFFLElBQUksR0FBRyxRQUFRLEdBQUcsR0FBRztTQUM3QixDQUFDO1FBQ0YsNEJBQTZCLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RixPQUFPLDRCQUE2QixDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDMUcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLEVBQUU7Z0JBQ3JDLE1BQU0sRUFBRSxHQUFHLFNBQVMsRUFBRTthQUN0QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtRQUN6QyxNQUFNLEdBQUcsR0FBRyx1QkFBdUIsQ0FBQztRQUNwQyxNQUFNLFFBQVEsR0FBRyw4QkFBOEIsQ0FBQztRQUNoRCxNQUFNLGFBQWEsR0FBRztZQUNyQixLQUFLLEVBQUUsNkNBQTZDO1NBQ3BELENBQUM7UUFDRiw0QkFBNkIsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxJQUFJLEVBQUUsR0FBRyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLE9BQU8sNEJBQTZCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMxRyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsR0FBRyxNQUFNLEVBQUUsRUFBRTtnQkFDckMsS0FBSyxFQUFFLEdBQUcsR0FBRyxjQUFjO2FBQzNCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDekMsTUFBTSxHQUFHLEdBQUc7WUFDWCxPQUFPLEVBQUUsT0FBTztZQUNoQixPQUFPLEVBQUUsT0FBTztTQUNoQixDQUFDO1FBQ0YsTUFBTSxhQUFhLEdBQUcsK0JBQStCLENBQUM7UUFDdEQsTUFBTSxjQUFjLEdBQUcsTUFBTSw0QkFBNkIsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEdBQUcsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQ3hILE1BQU0sQ0FBQyxlQUFlLENBQUMsY0FBYyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFFN0MsTUFBTSxhQUFhLEdBQUc7WUFDckIsTUFBTSxFQUFFLE1BQU07WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLDBCQUEwQixFQUFFLDBCQUEwQjtnQkFDdEQsTUFBTSxFQUFFLFFBQVE7YUFDaEI7U0FDRCxDQUFDO1FBRUYsT0FBTyw0QkFBNkIsQ0FBQyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUVuSCxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLEVBQUU7b0JBQ3JDLE1BQU0sRUFBRSxNQUFNO29CQUNkLFVBQVUsRUFBRTt3QkFDWCxNQUFNLEVBQUUsUUFBUTt3QkFDaEIsbUNBQW1DLEVBQUUsbUNBQW1DO3dCQUN4RSxNQUFNLEVBQUUsUUFBUTtxQkFDaEI7aUJBQ0QsQ0FBQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxlQUFlLENBQUMsRUFBRSxHQUFHLE1BQU0sRUFBRSxFQUFFO29CQUNyQyxNQUFNLEVBQUUsTUFBTTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1gsTUFBTSxFQUFFLFFBQVE7d0JBQ2hCLGlDQUFpQyxFQUFFLGlDQUFpQzt3QkFDcEUsTUFBTSxFQUFFLFFBQVE7cUJBQ2hCO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUM7WUFFRCxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFckQsTUFBTSxhQUFhLEdBQUc7WUFDckIsTUFBTSxFQUFFLG1CQUFtQjtZQUMzQixNQUFNLEVBQUUsTUFBTTtZQUNkLFNBQVMsRUFBRSxRQUFRO1lBQ25CLFdBQVcsRUFBRSxpQkFBaUI7WUFDOUIsTUFBTSxFQUFFLElBQUk7WUFDWixZQUFZLEVBQUUsS0FBSztZQUNuQixRQUFRLEVBQUUsSUFBSTtTQUNkLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLDRCQUE2QixDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDcEgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUdILE1BQU0sa0JBQWtCO0lBQXhCO1FBR1EsY0FBUyxHQUFHLENBQUMsQ0FBQztRQUVyQix5QkFBb0IsR0FBRyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQzdDLHdCQUFtQixHQUFHLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFhN0MsQ0FBQztJQVpPLGNBQWMsQ0FBQyxTQUFpQixFQUFFLEdBQUcsSUFBVztRQUN0RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFakIsSUFBSSxNQUFNLEdBQUcsR0FBRyxTQUFTLFNBQVMsQ0FBQztRQUNuQyxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdEIsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM5QixNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGdCQUFnQjtJQUF0QjtRQTBCVSwwQkFBcUIsR0FBaUMsSUFBSSxPQUFPLEVBQXlCLENBQUMsS0FBSyxDQUFDO0lBQzNHLENBQUM7SUF6QkEsV0FBVyxDQUFDLFFBQWEsRUFBRSxPQUE0RTtRQUN0RyxPQUFPLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUNELG1CQUFtQixDQUFDLFFBQWE7UUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCxpQkFBaUIsQ0FBQyxTQUFrRCxFQUFFLE9BQWdDO1FBQ3JHLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsWUFBWSxDQUFDLE1BQWMsRUFBRSxTQUFrQjtRQUM5QyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNNLGNBQWM7UUFDcEIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCxZQUFZLENBQUMsTUFBYyxFQUFFLFNBQWtCO1FBQzlDLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsaUJBQWlCLENBQUMsU0FBaUM7UUFDbEQsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCx1QkFBdUIsQ0FBQyxTQUFpQztRQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUVEO0FBRUQsTUFBTSxlQUFlO0lBQXJCO1FBS0MscUJBQWdCLEdBQVcsT0FBTyxDQUFDLElBQUksQ0FBQztJQWdCekMsQ0FBQztJQW5CQSxJQUFJLElBQUk7UUFDUCxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELE9BQU8sQ0FBQyxJQUFZO1FBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBR0QsUUFBUSxDQUFDLE9BQWtDO1FBQzFDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUM1QyxPQUFPLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBR0QsZ0JBQWdCLENBQUMsUUFBYSxFQUFFLElBQXdDLEVBQUUsSUFBYTtRQUN0RixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUVEO0FBRUQsTUFBTSw4QkFBK0IsU0FBUSx3QkFBd0I7SUFDcEQsUUFBUSxDQUFDLElBQVUsRUFBRSxJQUFVO1FBQzlDLElBQUksYUFBYSxDQUFDO1FBQ2xCLElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLGFBQWEsR0FBRztnQkFDZixNQUFNLEVBQUU7b0JBQ1A7d0JBQ0MsRUFBRSxFQUFFLFFBQVE7d0JBQ1osSUFBSSxFQUFFLGNBQWM7d0JBQ3BCLFdBQVcsRUFBRSxhQUFhO3dCQUMxQixPQUFPLEVBQUUsZ0JBQWdCO3FCQUN6QjtvQkFDRDt3QkFDQyxFQUFFLEVBQUUsUUFBUTt3QkFDWixJQUFJLEVBQUUsWUFBWTt3QkFDbEIsV0FBVyxFQUFFLGFBQWE7d0JBQzFCLE9BQU8sRUFBRSxTQUFTO3dCQUNsQixPQUFPLEVBQUUsQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQztxQkFDMUM7b0JBQ0Q7d0JBQ0MsRUFBRSxFQUFFLFFBQVE7d0JBQ1osSUFBSSxFQUFFLGNBQWM7d0JBQ3BCLFdBQVcsRUFBRSxhQUFhO3dCQUMxQixPQUFPLEVBQUUsZ0JBQWdCO3dCQUN6QixPQUFPLEVBQUUsSUFBSTt3QkFDYixRQUFRLEVBQUUsSUFBSTtxQkFDZDtvQkFDRDt3QkFDQyxFQUFFLEVBQUUsUUFBUTt3QkFDWixJQUFJLEVBQUUsU0FBUzt3QkFDZixPQUFPLEVBQUUsVUFBVTt3QkFDbkIsSUFBSSxFQUFFOzRCQUNMLEtBQUssRUFBRSxpQkFBaUI7eUJBQ3hCO3FCQUNEO2lCQUNEO2FBQ0QsQ0FBQztRQUNILENBQUM7UUFDRCxPQUFPLGFBQWEsQ0FBQztJQUN0QixDQUFDO0lBRWUsT0FBTyxDQUFJLEdBQVcsRUFBRSxTQUFtQztRQUMxRSxPQUFPO1lBQ04sS0FBSyxFQUFFLFNBQVM7WUFDaEIsWUFBWSxFQUFFLFNBQVM7WUFDdkIsU0FBUyxFQUFFLFNBQVM7WUFDcEIsbUJBQW1CLEVBQUUsRUFBRTtTQUN2QixDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtJQUM3Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7UUFDL0IsTUFBTSxJQUFJLEdBQUcsK0JBQStCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1FBQ2hDLE1BQU0sSUFBSSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1FBQ2pELE1BQU0sSUFBSSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDLENBQUM7UUFDekYsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUN4RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDL0MsTUFBTSxJQUFJLEdBQUcsK0JBQStCLENBQUMsS0FBSyxDQUFDO1lBQ2xELElBQUksRUFBRSxpQkFBaUI7WUFDdkIsSUFBSSxFQUFFLG9CQUFvQjtZQUMxQixRQUFRLEVBQUU7Z0JBQ1QsS0FBSyxFQUFFLGdCQUFnQjthQUN2QjtZQUNELEtBQUssRUFBRSxDQUFDLGFBQWEsRUFBRSxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztTQUM3QyxDQUFDLENBQUM7UUFFSCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNwRyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7UUFDbkMsTUFBTSxJQUFJLEdBQUcsK0JBQStCLENBQUMsS0FBSyxDQUFDO1lBQ2xELElBQUksRUFBRSxpQkFBaUI7WUFDdkIsSUFBSSxFQUFFLG9CQUFvQjtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsVUFBVSxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDekcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRW5HLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFO1lBQ3ZDLElBQUksRUFBRSxVQUFVO1lBQ2hCLElBQUksRUFBRSx1QkFBdUI7U0FDN0IsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBQ3ZDLE1BQU0sSUFBSSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQztZQUNsRCxJQUFJLEVBQUUsaUJBQWlCO1NBQ3ZCLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFO1lBQ3ZDLElBQUksRUFBRSxpQkFBaUI7U0FDdkIsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1FBQzdDLE1BQU0sSUFBSSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQztZQUNsRCxLQUFLLEVBQUUsYUFBYTtZQUNwQixNQUFNLEVBQUUsYUFBYTtTQUNyQixDQUFDLENBQUM7UUFFSCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTlDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxZQUFZO1lBQ25CLE1BQU0sRUFBRSxZQUFZO1NBQ3BCLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN0QyxNQUFNLElBQUksR0FBRywrQkFBK0IsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUMxRSxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTlDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1FBQzlELE1BQU0sSUFBSSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXpDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNqRyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxNQUFNLElBQUksR0FBRywrQkFBK0IsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztRQUNyRixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLE1BQU0sSUFBSSxHQUFHLCtCQUErQixDQUFDLEtBQUssQ0FBQztZQUNsRCxJQUFJLEVBQUUsbUJBQW1CO1lBQ3pCLCtCQUErQixFQUFFLE9BQU87U0FDeEMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQzVCLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLENBQUM7WUFDOUMsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ2pDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzdCLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDdkMsSUFBSSxFQUFFLG9CQUFvQjtZQUMxQixnQ0FBZ0MsRUFBRSxPQUFPO1NBQ3pDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtRQUMvQyxNQUFNLElBQUksR0FBRywrQkFBK0IsQ0FBQyxLQUFLLENBQUM7WUFDbEQsR0FBRyxFQUFFO2dCQUNKLElBQUksRUFBRSxlQUFlO2dCQUNyQixHQUFHLEVBQUUsY0FBYztnQkFDbkIsSUFBSSxFQUFFLGVBQWU7YUFDckI7U0FDRCxDQUFDLENBQUM7UUFFSCxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUIsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQzVCLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsR0FBRyxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO1lBQ3JELENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDdkMsR0FBRyxFQUFFO2dCQUNKLElBQUksRUFBRSxTQUFTO2dCQUNmLEdBQUcsRUFBRSxLQUFLO2dCQUNWLElBQUksRUFBRSxtQkFBbUI7YUFDekI7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7UUFDbEQsTUFBTSxJQUFJLEdBQUcsK0JBQStCLENBQUMsS0FBSyxDQUFDO1lBQ2xELGNBQWMsRUFBRSxnQkFBZ0I7U0FDaEMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDO1FBQ0QsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzlCLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDdkMsU0FBUyxFQUFFLFdBQVc7U0FDdEIsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9