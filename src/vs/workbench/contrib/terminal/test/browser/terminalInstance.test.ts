/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { TerminalLabelComputer, parseExitResult } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IWorkspaceContextService, IWorkspaceFolder, toWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { fixPath, getUri } from 'vs/workbench/services/search/test/browser/queryBuilder.test';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ProcessState } from 'vs/workbench/contrib/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { Schemas } from 'vs/base/common/network';
import { TestFileService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { DisposableStore } from 'vs/base/common/lifecycle';

const root1 = '/foo/root1';
const ROOT_1 = fixPath(root1);
const root2 = '/foo/root2';
const ROOT_2 = fixPath(root2);
const emptyRoot = '/foo';
const ROOT_EMPTY = fixPath(emptyRoot);

suite('Workbench - TerminalInstance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseExitResult', () => {
		test('should return no message for exit code = undefined', () => {
			deepStrictEqual(
				parseExitResult(undefined, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: undefined, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(undefined, {}, ProcessState.KilledByUser, undefined),
				{ code: undefined, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(undefined, {}, ProcessState.KilledByProcess, undefined),
				{ code: undefined, message: undefined }
			);
		});
		test('should return no message for exit code = 0', () => {
			deepStrictEqual(
				parseExitResult(0, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 0, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(0, {}, ProcessState.KilledByUser, undefined),
				{ code: 0, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(0, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 0, message: undefined }
			);
		});
		test('should return friendly message when executable is specified for non-zero exit codes', () => {
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo' }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1, message: 'The terminal process "foo" failed to launch (exit code: 1).' }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo' }, ProcessState.KilledByUser, undefined),
				{ code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo' }, ProcessState.KilledByProcess, undefined),
				{ code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
			);
		});
		test('should return friendly message when executable and args are specified for non-zero exit codes', () => {
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1, message: `The terminal process "foo 'bar', 'baz'" failed to launch (exit code: 1).` }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, ProcessState.KilledByUser, undefined),
				{ code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, ProcessState.KilledByProcess, undefined),
				{ code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
			);
		});
		test('should return friendly message when executable and arguments are omitted for non-zero exit codes', () => {
			deepStrictEqual(
				parseExitResult(1, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1, message: `The terminal process failed to launch (exit code: 1).` }
			);
			deepStrictEqual(
				parseExitResult(1, {}, ProcessState.KilledByUser, undefined),
				{ code: 1, message: `The terminal process terminated with exit code: 1.` }
			);
			deepStrictEqual(
				parseExitResult(1, {}, ProcessState.KilledByProcess, undefined),
				{ code: 1, message: `The terminal process terminated with exit code: 1.` }
			);
		});
		test('should ignore pty host-related errors', () => {
			deepStrictEqual(
				parseExitResult({ message: 'Could not find pty with id 16' }, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: undefined, message: undefined }
			);
		});
		test('should format conpty failure code 5', () => {
			deepStrictEqual(
				parseExitResult({ code: 5, message: 'A native exception occurred during launch (Cannot create process, error code: 5)' }, { executable: 'foo' }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 5, message: `The terminal process failed to launch: Access was denied to the path containing your executable "foo". Manage and change your permissions to get this to work.` }
			);
		});
		test('should format conpty failure code 267', () => {
			deepStrictEqual(
				parseExitResult({ code: 267, message: 'A native exception occurred during launch (Cannot create process, error code: 267)' }, {}, ProcessState.KilledDuringLaunch, '/foo'),
				{ code: 267, message: `The terminal process failed to launch: Invalid starting directory "/foo", review your terminal.integrated.cwd setting.` }
			);
		});
		test('should format conpty failure code 1260', () => {
			deepStrictEqual(
				parseExitResult({ code: 1260, message: 'A native exception occurred during launch (Cannot create process, error code: 1260)' }, { executable: 'foo' }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1260, message: `The terminal process failed to launch: Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator.` }
			);
		});
		test('should format generic failures', () => {
			deepStrictEqual(
				parseExitResult({ code: 123, message: 'A native exception occurred during launch (Cannot create process, error code: 123)' }, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 123, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot create process, error code: 123).` }
			);
			deepStrictEqual(
				parseExitResult({ code: 123, message: 'foo' }, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 123, message: `The terminal process failed to launch: foo.` }
			);
		});
	});
	suite('TerminalLabelComputer', () => {
		let store: DisposableStore;
		let configurationService: TestConfigurationService;
		let terminalLabelComputer: TerminalLabelComputer;
		let instantiationService: TestInstantiationService;
		let mockContextService: TestContextService;
		let mockMultiRootContextService: TestContextService;
		let emptyContextService: TestContextService;
		let mockWorkspace: Workspace;
		let mockMultiRootWorkspace: Workspace;
		let emptyWorkspace: Workspace;
		let capabilities: TerminalCapabilityStore;
		let configHelper: TerminalConfigHelper;

		function createInstance(partial?: Partial<ITerminalInstance>): Pick<ITerminalInstance, 'shellLaunchConfig' | 'userHome' | 'cwd' | 'initialCwd' | 'processName' | 'sequence' | 'workspaceFolder' | 'staticTitle' | 'capabilities' | 'title' | 'description'> {
			const capabilities = store.add(new TerminalCapabilityStore());
			if (!isWindows) {
				capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
			}
			return {
				shellLaunchConfig: {},
				cwd: 'cwd',
				initialCwd: undefined,
				processName: '',
				sequence: undefined,
				workspaceFolder: undefined,
				staticTitle: undefined,
				capabilities,
				title: '',
				description: '',
				userHome: undefined,
				...partial
			};
		}

		setup(async () => {
			store = new DisposableStore();
			instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IWorkspaceContextService, new TestContextService());
			capabilities = store.add(new TerminalCapabilityStore());
			if (!isWindows) {
				capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
			}

			const ROOT_1_URI = getUri(ROOT_1);
			mockContextService = new TestContextService();
			mockWorkspace = new Workspace('workspace', [toWorkspaceFolder(ROOT_1_URI)]);
			mockContextService.setWorkspace(mockWorkspace);

			const ROOT_2_URI = getUri(ROOT_2);
			mockMultiRootContextService = new TestContextService();
			mockMultiRootWorkspace = new Workspace('multi-root-workspace', [toWorkspaceFolder(ROOT_1_URI), toWorkspaceFolder(ROOT_2_URI)]);
			mockMultiRootContextService.setWorkspace(mockMultiRootWorkspace);

			const ROOT_EMPTY_URI = getUri(ROOT_EMPTY);
			emptyContextService = new TestContextService();
			emptyWorkspace = new Workspace('empty workspace', [], ROOT_EMPTY_URI);
			emptyContextService.setWorkspace(emptyWorkspace);
		});

		teardown(() => store.dispose());

		test('should resolve to "" when the template variables are empty', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '', description: '' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: '' }));
			// TODO:
			// terminalLabelComputer.onLabelChanged(e => {
			// 	strictEqual(e.title, '');
			// 	strictEqual(e.description, '');
			// });
			strictEqual(terminalLabelComputer.title, '');
			strictEqual(terminalLabelComputer.description, '');
		});
		test('should resolve cwd', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${cwd}', description: '${cwd}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: ROOT_1 }));
			strictEqual(terminalLabelComputer.title, ROOT_1);
			strictEqual(terminalLabelComputer.description, ROOT_1);
		});
		test('should resolve workspaceFolder', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${workspaceFolder}', description: '${workspaceFolder}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: 'folder' }) } as IWorkspaceFolder }));
			strictEqual(terminalLabelComputer.title, 'folder');
			strictEqual(terminalLabelComputer.description, 'folder');
		});
		test('should resolve local', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${local}', description: '${local}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Local' } }));
			strictEqual(terminalLabelComputer.title, 'Local');
			strictEqual(terminalLabelComputer.description, 'Local');
		});
		test('should resolve process', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${process}', description: '${process}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh' }));
			strictEqual(terminalLabelComputer.title, 'zsh');
			strictEqual(terminalLabelComputer.description, 'zsh');
		});
		test('should resolve sequence', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${sequence}', description: '${sequence}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: 'sequence' }));
			strictEqual(terminalLabelComputer.title, 'sequence');
			strictEqual(terminalLabelComputer.description, 'sequence');
		});
		test('should resolve task', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${task}', description: '${task}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Task' } }));
			strictEqual(terminalLabelComputer.title, 'zsh ~ Task');
			strictEqual(terminalLabelComputer.description, 'Task');
		});
		test('should resolve separator', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${separator}', description: '${separator}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Task' } }));
			strictEqual(terminalLabelComputer.title, 'zsh');
			strictEqual(terminalLabelComputer.description, '');
		});
		test('should always return static title when specified', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}', description: '${workspaceFolder}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: 'folder' }) } as IWorkspaceFolder, staticTitle: 'my-title' }));
			strictEqual(terminalLabelComputer.title, 'my-title');
			strictEqual(terminalLabelComputer.description, 'folder');
		});
		test('should provide cwdFolder for all cwds only when in multi-root', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_1 }));
			// single-root, cwd is same as root
			strictEqual(terminalLabelComputer.title, 'process');
			strictEqual(terminalLabelComputer.description, '');
			// multi-root
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockMultiRootContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_2 }));
			if (isWindows) {
				strictEqual(terminalLabelComputer.title, 'process');
				strictEqual(terminalLabelComputer.description, '');
			} else {
				strictEqual(terminalLabelComputer.title, 'process ~ root2');
				strictEqual(terminalLabelComputer.description, 'root2');
			}
		});
		test('should hide cwdFolder in single folder workspaces when cwd matches the workspace\'s default cwd even when slashes differ', async () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
			configHelper = store.add(new TerminalConfigHelper(configurationService, null!, null!, null!, null!));
			terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_1 }));
			strictEqual(terminalLabelComputer.title, 'process');
			strictEqual(terminalLabelComputer.description, '');
			if (!isWindows) {
				terminalLabelComputer = store.add(new TerminalLabelComputer(configHelper, new TestFileService(), mockContextService));
				terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_2 }));
				strictEqual(terminalLabelComputer.title, 'process ~ root2');
				strictEqual(terminalLabelComputer.description, 'root2');
			}
		});
	});
});
