/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { WorkspaceExtensionsConfigService } from '../../common/workspaceExtensionsConfig.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IJSONEditingService } from '../../../configuration/common/jsonEditing.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

suite('WorkspaceExtensionsConfigService - Local Overrides', () => {

	let fileService: IFileService;
	let folderA: URI;
	let folderB: URI;
	let workspaceConfig: URI;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		folderA = joinPath(ROOT, 'a');
		folderB = joinPath(ROOT, 'b');
		workspaceConfig = joinPath(ROOT, 'test.code-workspace');
		const localWorkspaceConfig = workspaceConfig.with({ path: `${workspaceConfig.path}.local` });

		await fileService.createFolder(folderA);
		await fileService.createFolder(folderB);

		await fileService.writeFile(workspaceConfig, VSBuffer.fromString(JSON.stringify({
			folders: [{ path: folderA.path }, { path: folderB.path }],
			extensions: { recommendations: ['shared.extension'] }
		}, null, '\t')));

		await fileService.writeFile(localWorkspaceConfig, VSBuffer.fromString(JSON.stringify({
			extensions: { recommendations: ['local.extension'] }
		}, null, '\t')));
	});

	test('merges local workspace extension recommendations', async () => {
		const service = disposables.add(new WorkspaceExtensionsConfigService(
			new TestContextService(new Workspace('test', [toWorkspaceFolder(folderA), toWorkspaceFolder(folderB)], workspaceConfig)),
			fileService,
			{} as IQuickInputService,
			{} as IModelService,
			{} as ILanguageService,
			{} as IJSONEditingService
		));

		const recommendations = await service.getRecommendations();
		assert.deepStrictEqual(recommendations.sort(), ['local.extension', 'shared.extension'].sort());
	});

});
