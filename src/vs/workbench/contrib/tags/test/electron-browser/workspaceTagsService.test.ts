/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService, IFileStat, IFileStatResult } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { testIWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ITextFileContent, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceTagsService } from '../../electron-browser/workspaceTagsService.js';

suite('Telemetry - WorkspaceTagsService', () => {
	test('Continues collecting tags after individual vcpkg reads fail', async () => {
		const roots = [URI.file('/broken'), URI.file('/working')];
		const names = ['vcpkg.json', 'vcpkg-configuration.json', 'package.json'];
		const stat = (resource: URI, isDirectory: boolean, children?: IFileStat[]): IFileStat => ({
			resource, name: resource.path.split('/').pop()!, isFile: !isDirectory, isDirectory, isSymbolicLink: false, children
		});
		const fileService = new class extends mock<IFileService>() {
			override async exists(resource: URI): Promise<boolean> {
				return !resource.path.endsWith('/aiGeneratedWorkspaces.json');
			}
			override async resolveAll(): Promise<IFileStatResult[]> {
				return roots.map(root => ({ success: true, stat: stat(root, true, names.map(name => stat(URI.joinPath(root, name), false))) }));
			}
		};
		const contextService = new class extends mock<IWorkspaceContextService>() {
			override getWorkbenchState() { return WorkbenchState.WORKSPACE; }
			override getWorkspace() {
				return testIWorkspace({ id: 'test', folders: roots.map((uri, index) => ({ uri, index, name: uri.path, toResource: path => URI.joinPath(uri, path) })) });
			}
		};
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly workspaceStorageHome = URI.file('/storage');
			override readonly filesToOpenOrCreate = undefined;
			override readonly filesToDiff = undefined;
			override readonly filesToMerge = undefined;
		};
		const textFileService = new class extends mock<ITextFileService>() {
			override async read(resource: URI): Promise<ITextFileContent> {
				if (resource.path.startsWith('/broken/') && !resource.path.endsWith('/package.json')) {
					throw new Error('Unreadable vcpkg file');
				}
				const value = resource.path.endsWith('/vcpkg.json')
					? JSON.stringify({ dependencies: ['azure-identity-cpp'], 'vcpkg-configuration': { 'default-registry': { repository: 'git@github.com:Azure/azure-sdk-vcpkg-betas' } } })
					: resource.path.endsWith('/package.json') ? JSON.stringify({ dependencies: { react: '1.0.0' } }) : '{}';
				return { resource, name: resource.path.split('/').pop()!, value, encoding: 'utf8', mtime: 0, ctime: 0, size: 0, etag: '', readonly: false, locked: false, executable: false };
			}
		};
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		};
		const service = new WorkspaceTagsService(fileService, contextService, environmentService, textFileService, logService);
		const tags = await service.getTags();
		assert.deepStrictEqual({
			identity: tags['workspace.cpp.azure-identity'],
			beta: tags['workspace.cpp.vcpkg-config.azure-sdk-for-cpp.beta'],
			react: tags['workspace.npm.react'],
			warnings: warnings.length
		}, { identity: true, beta: true, react: true, warnings: 2 });
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
