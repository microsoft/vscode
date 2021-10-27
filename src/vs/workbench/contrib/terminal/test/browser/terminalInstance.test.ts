/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { TerminalLabelComputer } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IWorkspaceContextService, toWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ProcessCapability } from 'vs/platform/terminal/common/terminal';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { fixPath, getUri } from 'vs/workbench/contrib/search/test/browser/queryBuilder.test';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { basename } from 'vs/base/common/path';

function createInstance(partial?: Partial<ITerminalInstance>): Pick<ITerminalInstance, 'shellLaunchConfig' | 'userHome' | 'cwd' | 'initialCwd' | 'processName' | 'sequence' | 'workspaceFolder' | 'staticTitle' | 'capabilities' | 'title' | 'description'> {
	return {
		shellLaunchConfig: {},
		cwd: 'cwd',
		initialCwd: undefined,
		processName: '',
		sequence: undefined,
		workspaceFolder: undefined,
		staticTitle: undefined,
		capabilities: isWindows ? [] : [ProcessCapability.CwdDetection],
		title: '',
		description: '',
		userHome: undefined,
		...partial
	};
}
const root1 = '/foo/root1';
const ROOT_1 = fixPath(root1);
const root2 = '/foo/root2';
const ROOT_2 = fixPath(root2);
const emptyRoot = '/foo';
const ROOT_EMPTY = fixPath(emptyRoot);
suite('Workbench - TerminalInstance', () => {
	suite('refreshLabel', () => {
		let configurationService: TestConfigurationService;
		let terminalLabelComputer: TerminalLabelComputer;
		let instantiationService: TestInstantiationService;
		let mockContextService: TestContextService;
		let mockMultiRootContextService: TestContextService;
		let emptyContextService: TestContextService;
		let mockWorkspace: Workspace;
		let mockMultiRootWorkspace: Workspace;
		let emptyWorkspace: Workspace;
		let capabilities: ProcessCapability[];
		let configHelper: TerminalConfigHelper;
		setup(async () => {
			instantiationService = new TestInstantiationService();
			instantiationService.stub(IWorkspaceContextService, new TestContextService());
			capabilities = isWindows ? [] : [ProcessCapability.CwdDetection];

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

		test('should resolve to "" when the template variables are empty', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '', description: '' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: '' }), mockContextService);
			terminalLabelComputer.refreshLabel();
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
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, cwd: ROOT_1 }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, ROOT_1);
			strictEqual(terminalLabelComputer.description, ROOT_1);
		});
		test('should resolve cwdFolder in a single root workspace if cwd differs from root', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${process}', description: '${cwdFolder}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, cwd: ROOT_2, processName: 'zsh' }), mockContextService);
			terminalLabelComputer.refreshLabel();
			if (isWindows) {
				strictEqual(terminalLabelComputer.title, 'zsh');
				strictEqual(terminalLabelComputer.description, '');
			} else {
				strictEqual(terminalLabelComputer.title, 'zsh');
				strictEqual(terminalLabelComputer.description, basename(ROOT_2));
			}
		});
		test('should resolve workspaceFolder', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${workspaceFolder}', description: '${workspaceFolder}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'zsh', workspaceFolder: 'folder' }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'folder');
			strictEqual(terminalLabelComputer.description, 'folder');
		});
		test('should resolve local', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${local}', description: '${local}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { description: 'Local' } }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'Local');
			strictEqual(terminalLabelComputer.description, 'Local');
		});
		test('should resolve process', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${process}', description: '${process}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'zsh' }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'zsh');
			strictEqual(terminalLabelComputer.description, 'zsh');
		});
		test('should resolve sequence', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' - ', title: '${sequence}', description: '${sequence}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, sequence: 'sequence' }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'sequence');
			strictEqual(terminalLabelComputer.description, 'sequence');
		});
		test('should resolve task', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${task}', description: '${task}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { description: 'Task' } }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'zsh ~ Task');
			strictEqual(terminalLabelComputer.description, 'Task');
		});
		test('should resolve separator', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${separator}', description: '${separator}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { description: 'Task' } }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'zsh');
			strictEqual(terminalLabelComputer.description, '');
		});
		test('should always return static title when specified', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}', description: '${workspaceFolder}' } } } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'process', workspaceFolder: 'folder', staticTitle: 'my-title' }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'my-title');
			strictEqual(terminalLabelComputer.description, 'folder');
		});
		test('should provide cwdFolder for all cwds only when in multi-root', () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } }, cwd: ROOT_1 } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'process', workspaceFolder: 'folder', cwd: ROOT_1 }), mockContextService);
			terminalLabelComputer.refreshLabel();
			// single-root, cwd is same as root
			strictEqual(terminalLabelComputer.title, 'process');
			strictEqual(terminalLabelComputer.description, '');
			// multi-root
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } }, cwd: ROOT_1 } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'process', workspaceFolder: 'folder', cwd: ROOT_2 }), mockMultiRootContextService);
			terminalLabelComputer.refreshLabel();
			if (isWindows) {
				strictEqual(terminalLabelComputer.title, 'process');
				strictEqual(terminalLabelComputer.description, '');
			} else {
				strictEqual(terminalLabelComputer.title, 'process ~ root2');
				strictEqual(terminalLabelComputer.description, 'root2');
			}
		});
		test('should hide cwdFolder in single folder workspaces when cwd matches the workspace\'s default cwd even when slashes differ', async () => {
			configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } }, cwd: '\\foo\\root1' } });
			configHelper = new TerminalConfigHelper(configurationService, null!, null!, null!, null!, null!);
			terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'process', workspaceFolder: 'folder', cwd: ROOT_1 }), mockContextService);
			terminalLabelComputer.refreshLabel();
			strictEqual(terminalLabelComputer.title, 'process');
			strictEqual(terminalLabelComputer.description, '');
			if (!isWindows) {
				terminalLabelComputer = new TerminalLabelComputer(configHelper, createInstance({ capabilities, processName: 'process', workspaceFolder: 'folder', cwd: ROOT_2 }), mockContextService);
				terminalLabelComputer.refreshLabel();
				strictEqual(terminalLabelComputer.title, 'process ~ root2');
				strictEqual(terminalLabelComputer.description, 'root2');
			}
		});
	});
});
