/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { ITerminalLabelTemplateProperties } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IWorkspaceContextService, toWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ProcessCapability } from 'vs/platform/terminal/common/terminal';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { fixPath, getUri } from 'vs/workbench/contrib/search/test/browser/queryBuilder.test';

function terminalProperties(partial?: Partial<ITerminalLabelTemplateProperties>): ITerminalLabelTemplateProperties {
	return {
		process: '',
		cwd: '',
		cwdFolder: '',
		separator: ' - ',
		...partial
	};
}

suite.only('Workbench - TerminalInstance', () => {
	suite('refreshLabel', () => {
		// let configurationService: TestConfigurationService;
		let instantiationService: TestInstantiationService;
		let mockContextService: TestContextService;
		let mockWorkspace: Workspace;
		let mockMultiRootWorkspace: Workspace;
		let capabilities: ProcessCapability[];
		setup(async () => {
			// configurationService = new TestConfigurationService({ 'terminal': { 'integrated': { 'tabs': { 'separator': ' - ' } } } });
			instantiationService = new TestInstantiationService();
			instantiationService.stub(IWorkspaceContextService, new TestContextService());
			capabilities = isWindows ? [] : [ProcessCapability.CwdDetection];
			const ROOT_1 = fixPath('/foo/root1');
			const ROOT_1_URI = getUri(ROOT_1);
			const ROOT_2 = fixPath('/foo/root2');
			const ROOT_2_URI = getUri(ROOT_2);
			mockContextService = new TestContextService();
			mockWorkspace = new Workspace('workspace', [toWorkspaceFolder(ROOT_1_URI)]);
			mockMultiRootWorkspace = new Workspace('workspace', [toWorkspaceFolder(ROOT_1_URI), toWorkspaceFolder(ROOT_2_URI)]);
			mockContextService.setWorkspace(mockWorkspace);
			//TODO: test LabelComputer
		});

		test('should resolve to "" when the template variables are empty', () => {
			strictEqual(refreshLabel('${process}', terminalProperties({ process: '' }), mockContextService, capabilities, undefined), '');
		});
		test('should resolve cwd', () => {
			strictEqual(refreshLabel('${cwd}', terminalProperties({ process: 'bash', cwd: '/fake/directory' } as any), mockContextService, capabilities, undefined), '/fake/directory');
		});
		test('should resolve cwdFolder', () => {
			if (isWindows) {
				strictEqual(refreshLabel('${process}${separator}${cwdFolder}', terminalProperties({ cwdFolder: 'folder', process: 'zsh' }), mockContextService, capabilities, undefined), 'zsh - ');
			} else {
				strictEqual(refreshLabel('${process}${separator}${cwdFolder}', terminalProperties({ cwdFolder: 'folder', process: 'zsh' }), mockContextService, capabilities, undefined), 'zsh - folder');
			}
		});
		test('should resolve workspaceFolder', () => {
			strictEqual(refreshLabel('${cwd}${separator}${workspaceFolder}', terminalProperties({ process: 'bash', cwd: '/fake/directory', workspaceFolder: 'workspace1' }), mockContextService, capabilities, undefined), '/fake/directory - workspace1');
		});
		test('should resolve local', () => {
			strictEqual(refreshLabel('${local}', terminalProperties({ cwdFolder: 'folder', process: 'zsh', local: 'Local' }), mockContextService, capabilities, undefined), 'Local');
		});
		test('should resolve process', () => {
			strictEqual(refreshLabel('${process}', terminalProperties({ process: 'bash' }), mockContextService, capabilities, undefined), 'bash');
		});
		test('should resolve sequence', () => {
			strictEqual(refreshLabel('${sequence}', terminalProperties({ sequence: 'sdfsdfsdfsfsfds' }), mockContextService, capabilities, undefined), 'sdfsdfsdfsfsfds');
		});
		test('should resolve task', () => {
			strictEqual(refreshLabel('${task}', terminalProperties({ cwdFolder: 'folder', process: 'zsh', local: 'Local', task: 'Task' }), mockContextService, capabilities, undefined), 'Task');
		});
		test('should resolve separator', () => {
			strictEqual(refreshLabel('${process}${separator}${local}', terminalProperties({ separator: '', process: 'zsh', local: 'Local' }), mockContextService, capabilities, undefined), 'zshLocal');
			strictEqual(refreshLabel('${process}${separator}${local}', terminalProperties({ separator: ' ~ ', process: 'zsh', local: 'Local' }), mockContextService, capabilities, undefined), 'zsh ~ Local');
		});
		test('should always return static title when specified', () => {
			strictEqual(refreshLabel('${process}${separator}${local}', terminalProperties({ separator: '', process: 'zsh', local: 'Local' }), mockContextService, capabilities, undefined, 'my-title'), 'my-title');
		});
		test('should provide cwdFolder for all cwds only when in multi-root and single root when cwd differs from initial', () => {
			if (isWindows) {
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'bash', cwdFolder: 'root1' } as any), mockContextService, capabilities, undefined), '');
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'pwsh', cwdFolder: 'root2' } as any), mockContextService, capabilities, undefined), '');
				mockContextService.setWorkspace(mockMultiRootWorkspace);
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'bash', cwdFolder: 'root1' } as any), mockContextService, capabilities, undefined), '');
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'bash', cwdFolder: 'root2' } as any), mockContextService, capabilities, undefined), '');
			} else {
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'bash', cwdFolder: 'root1' } as any), mockContextService, capabilities, undefined), '');
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'pwsh', cwdFolder: 'src' } as any), mockContextService, capabilities, undefined), 'src');
				mockContextService.setWorkspace(mockMultiRootWorkspace);
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'bash', cwdFolder: 'root1' } as any), mockContextService, capabilities, undefined), 'root1');
				strictEqual(refreshLabel('${cwdFolder}', terminalProperties({ process: 'bash', cwdFolder: 'root2' } as any), mockContextService, capabilities, undefined), 'root2');
			}
		});
	});
	test('should hide cwdFolder in empty workspaces when cwd matches the workspace\'s default cwd ($HOME or $HOMEDRIVE$HOMEPATH)', async () => {
	});
	test('should hide cwdFolder in single-root workspaces when cwd matches the workspace\'s default cwd', async () => {
		// test providing terminal.integrated.cwd and other case
	});
});
