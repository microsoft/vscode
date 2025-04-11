/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IPath, normalize } from '../../../../../base/common/path.js';
import * as platform from '../../../../../base/common/platform.js';
import { isLinux, isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationOverrides, IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { IFormatterChangeEvent, ILabelService, ResourceLabelFormatter, Verbosity } from '../../../../../platform/label/common/label.js';
import { IWorkspace, IWorkspaceFolder, IWorkspaceIdentifier, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestEditorService, TestQuickInputService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IPathService } from '../../../path/common/pathService.js';
import { BaseConfigurationResolverService } from '../../browser/baseConfigurationResolverService.js';
import { IConfigurationResolverService } from '../../common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../common/configurationResolverExpression.js';

const mockLineNumber = 10;
class TestEditorServiceWithActiveEditor extends TestEditorService {
	override get activeTextEditorControl(): any {
		return {
			getEditorType() {
				return EditorType.ICodeEditor;
			},
			getSelection() {
				return new Selection(mockLineNumber, 1, mockLineNumber, 10);
			}
		};
	}
	override get activeEditor(): any {
		return {
			get resource(): any {
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
	let configurationResolverService: IConfigurationResolverService | null;
	const envVariables: { [key: string]: string } = { key1: 'Value for key1', key2: 'Value for key2' };
	// let environmentService: MockWorkbenchEnvironmentService;
	let mockCommandService: MockCommandService;
	let editorService: TestEditorServiceWithActiveEditor;
	let containingWorkspace: Workspace;
	let workspace: IWorkspaceFolder;
	let quickInputService: TestQuickInputService;
	let labelService: MockLabelService;
	let pathService: MockPathService;
	let extensionService: IExtensionService;

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
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
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
		const config: any = await configurationResolverService!.resolveAsync(workspace, obj);

		assert.strictEqual(config.program, expected);
		assert.strictEqual(config.windows, undefined);
		assert.strictEqual(config.osx, undefined);
		assert.strictEqual(config.linux, undefined);
		assert.strictEqual(JSON.stringify(obj), originalObj); // did not mutate original
	});

	test('workspace folder with argument', async () => {
		if (platform.isWindows) {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
	});

	test('workspace folder with invalid argument', async () => {
		await assert.rejects(async () => await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder:invalidLocation} xyz'));
	});

	test('workspace folder with undefined workspace folder', async () => {
		await assert.rejects(async () => await configurationResolverService!.resolveAsync(undefined, 'abc ${workspaceFolder} xyz'));
	});

	test('workspace folder with argument and undefined workspace folder', async () => {
		if (platform.isWindows) {
			assert.strictEqual(await configurationResolverService!.resolveAsync(undefined, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(undefined, 'abc ${workspaceFolder:workspaceLocation} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
	});

	test('workspace folder with invalid argument and undefined workspace folder', () => {
		assert.rejects(async () => await configurationResolverService!.resolveAsync(undefined, 'abc ${workspaceFolder:invalidLocation} xyz'));
	});

	test('workspace root folder name', async () => {
		assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceRootFolderName} xyz'), 'abc workspaceLocation xyz');
	});

	test('current selected line number', async () => {
		assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${lineNumber} xyz'), `abc ${mockLineNumber} xyz`);
	});

	test('relative file', async () => {
		assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${relativeFile} xyz'), 'abc file xyz');
	});

	test('relative file with argument', async () => {
		assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${relativeFile:workspaceLocation} xyz'), 'abc file xyz');
	});

	test('relative file with invalid argument', () => {
		assert.rejects(async () => await configurationResolverService!.resolveAsync(workspace, 'abc ${relativeFile:invalidLocation} xyz'));
	});

	test('relative file with undefined workspace folder', async () => {
		if (platform.isWindows) {
			assert.strictEqual(await configurationResolverService!.resolveAsync(undefined, 'abc ${relativeFile} xyz'), 'abc \\VSCode\\workspaceLocation\\file xyz');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(undefined, 'abc ${relativeFile} xyz'), 'abc /VSCode/workspaceLocation/file xyz');
		}
	});

	test('relative file with argument and undefined workspace folder', async () => {
		assert.strictEqual(await configurationResolverService!.resolveAsync(undefined, 'abc ${relativeFile:workspaceLocation} xyz'), 'abc file xyz');
	});

	test('relative file with invalid argument and undefined workspace folder', () => {
		assert.rejects(async () => await configurationResolverService!.resolveAsync(undefined, 'abc ${relativeFile:invalidLocation} xyz'));
	});

	test('substitute many', async () => {
		if (platform.isWindows) {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation');
		}
	});

	test('substitute one env variable', async () => {
		if (platform.isWindows) {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder} ${env:key1} xyz'), 'abc \\VSCode\\workspaceLocation Value for key1 xyz');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, 'abc ${workspaceFolder} ${env:key1} xyz'), 'abc /VSCode/workspaceLocation Value for key1 xyz');
		}
	});

	test('substitute many env variable', async () => {
		if (platform.isWindows) {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2');
		}
	});

	test('disallows nested keys (#77289)', async () => {
		assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${env:key1} ${env:key1${env:key2}}'), 'Value for key1 ');
	});

	test('supports extensionDir', async () => {
		const getExtension = stub(extensionService, 'getExtension');
		getExtension.withArgs('publisher.extId').returns(Promise.resolve({ extensionLocation: URI.file('/some/path') } as IExtensionDescription));

		assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${extensionInstallFolder:publisher.extId}'), URI.file('/some/path').fsPath);
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
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${env:key1} - ${env:Key1}'), 'Value for key1 - Value for key1');
		} else {
			assert.strictEqual(await configurationResolverService!.resolveAsync(workspace, '${env:key1} - ${env:Key1}'), 'Value for key1 - ');
		}
	});

	test('substitute one configuration variable', async () => {
		const configurationService: IConfigurationService = new TestConfigurationService({
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
		const configurationService: IConfigurationService = new TestConfigurationService({
			editor: {
				fontFamily: ['foo', 'bar']
			},
		});

		const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
		assert.strictEqual(await service.resolveAsync(workspace, 'abc ${config:editor.fontFamily} xyz'), 'abc foo,bar xyz');
	});

	test('substitute configuration variable with undefined workspace folder', async () => {
		const configurationService: IConfigurationService = new TestConfigurationService({
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
		} else {
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
		} else {
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

		return configurationResolverService!.resolveWithInteractionReplace(undefined, configuration).then(result => {
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

		return configurationResolverService!.resolveWithInteractionReplace(undefined, configuration, undefined, commandVariables).then(result => {
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

		return configurationResolverService!.resolveWithInteractionReplace(undefined, configuration, undefined, commandVariables).then(result => {
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
				const expectedProperty = (<any>expected)[property];
				if (isObject(result[property])) {
					assert.deepStrictEqual({ ...result[property] }, expectedProperty);
				} else {
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

		return configurationResolverService!.resolveWithInteractionReplace(undefined, configuration, undefined, commandVariables).then(result => {

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

		return configurationResolverService!.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {

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

		return configurationResolverService!.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {

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

		return configurationResolverService!.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {

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

		return configurationResolverService!.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {

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

		return configurationResolverService!.resolveWithInteractionReplace(undefined, configuration, 'tasks').then(result => {

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
		configurationResolverService!.contributeVariable(variable, async () => { return buildTask; });
		return configurationResolverService!.resolveWithInteractionReplace(workspace, configuration).then(result => {
			assert.deepStrictEqual({ ...result }, {
				'name': `${buildTask}`
			});
		});
	});

	test('resolveWithEnvironment', async () => {
		const env = {
			'VAR_1': 'VAL_1',
			'VAR_2': 'VAL_2'
		};
		const configuration = 'echo ${env:VAR_1}${env:VAR_2}';
		const resolvedResult = await configurationResolverService!.resolveWithEnvironment({ ...env }, undefined, configuration);
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

		return configurationResolverService!.resolveWithInteractionReplace(workspace, configuration, 'tasks').then(result => {

			if (platform.isWindows) {
				assert.deepStrictEqual({ ...result }, {
					'name': 'Test',
					'mappings': {
						'pos1': 'value1',
						'\\VSCode\\workspaceLocation/test1': '\\VSCode\\workspaceLocation/test2',
						'pos3': 'value3'
					}
				});
			} else {
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
});


class MockCommandService implements ICommandService {

	public _serviceBrand: undefined;
	public callCount = 0;

	onWillExecuteCommand = () => Disposable.None;
	onDidExecuteCommand = () => Disposable.None;
	public executeCommand(commandId: string, ...args: any[]): Promise<any> {
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

class MockLabelService implements ILabelService {
	_serviceBrand: undefined;
	getUriLabel(resource: URI, options?: { relative?: boolean | undefined; noPrefix?: boolean | undefined }): string {
		return normalize(resource.fsPath);
	}
	getUriBasenameLabel(resource: URI): string {
		throw new Error('Method not implemented.');
	}
	getWorkspaceLabel(workspace: URI | IWorkspaceIdentifier | IWorkspace, options?: { verbose: Verbosity }): string {
		throw new Error('Method not implemented.');
	}
	getHostLabel(scheme: string, authority?: string): string {
		throw new Error('Method not implemented.');
	}
	public getHostTooltip(): string | undefined {
		throw new Error('Method not implemented.');
	}
	getSeparator(scheme: string, authority?: string): '/' | '\\' {
		throw new Error('Method not implemented.');
	}
	registerFormatter(formatter: ResourceLabelFormatter): IDisposable {
		throw new Error('Method not implemented.');
	}
	registerCachedFormatter(formatter: ResourceLabelFormatter): IDisposable {
		throw new Error('Method not implemented.');
	}
	onDidChangeFormatters: Event<IFormatterChangeEvent> = new Emitter<IFormatterChangeEvent>().event;
}

class MockPathService implements IPathService {
	_serviceBrand: undefined;
	get path(): Promise<IPath> {
		throw new Error('Property not implemented');
	}
	defaultUriScheme: string = Schemas.file;
	fileURI(path: string): Promise<URI> {
		throw new Error('Method not implemented.');
	}
	userHome(options?: { preferLocal: boolean }): Promise<URI>;
	userHome(options: { preferLocal: true }): URI;
	userHome(options?: { preferLocal: boolean }): Promise<URI> | URI {
		const uri = URI.file('c:\\users\\username');
		return options?.preferLocal ? uri : Promise.resolve(uri);
	}
	hasValidBasename(resource: URI, basename?: string): Promise<boolean>;
	hasValidBasename(resource: URI, os: platform.OperatingSystem, basename?: string): boolean;
	hasValidBasename(resource: URI, arg2?: string | platform.OperatingSystem, name?: string): boolean | Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	resolvedUserHome: URI | undefined;
}

class MockInputsConfigurationService extends TestConfigurationService {
	public override getValue(arg1?: any, arg2?: any): any {
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

	public override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
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
			} else if (r.arg === 'USERNAME') {
				expr.resolve(r, 'testuser');
			}
		}

		assert.deepStrictEqual(expr.toObject(), {
			name: 'username: testuser',
			'key that is username: testuser': 'cool!'
		});
	});
});
