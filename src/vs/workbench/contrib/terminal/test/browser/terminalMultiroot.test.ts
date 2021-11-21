/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { TestCommandService } from 'vs/editor/test/browser/editorTestServices';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IWorkspace, IWorkspaceContextService, toWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
class TestWorkspaceContextService implements Partial<IWorkspaceContextService> {
	private _folders: string[] = [];
	getWorkspace(): IWorkspace {
		return testWorkspace(this._folders);
	}
	setFolders(folders: string[]): void {
		this._folders = folders;
	}
}
class MockCommandService extends TestCommandService {
	private _folderToChoose: string | undefined;
	override async executeCommand<T>(id: string, ...args: any[]): Promise<T> {
		if (id === PICK_WORKSPACE_FOLDER_COMMAND_ID) {
			if (this._folderToChoose) {
				const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
				return toWorkspaceFolder(joinPath(ROOT, this._folderToChoose)) as any;
			} else {
				return undefined as any;
			}
		} else {
			return super.executeCommand(id, args);
		}
	}
	setPick(folder: string): void {
		this._folderToChoose = folder;
	}
}
export function testWorkspace(resources: string[]): Workspace {
	const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
	const folders = [];
	for (const resource of resources) {
		const folderDir = joinPath(ROOT, resource);
		folders.push(toWorkspaceFolder(folderDir));
	}
	return new Workspace('workspaceId', folders);
}

suite('Workbench - Terminal - Multiroot', () => {
	let commandService: MockCommandService;
	let instantiationService: TestInstantiationService;
	let workspaceContextService: TestWorkspaceContextService;

	setup(async function () {
		instantiationService = new TestInstantiationService();
		new ServiceCollection(
			[IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { }],
		);
		commandService = instantiationService.createInstance(MockCommandService);
		instantiationService.stub(ICommandService, commandService);
	});

	suite.only('multiroot', () => {
		test('should not show prompt for single root', async () => {
			workspaceContextService.setFolders(['folderA']);
			const cwd = await commandService.executeCommand('workbench.action.terminal.new', undefined);
			deepStrictEqual(cwd, undefined);
		});
		test('should show prompt for multi root', async () => {
			workspaceContextService.setFolders(['folderA', 'folderB']);
			commandService.setPick('folderB');
			const cwd = await commandService.executeCommand('workbench.action.terminal.new', undefined);
			deepStrictEqual(cwd, 'folderB');
		});
	});
});
