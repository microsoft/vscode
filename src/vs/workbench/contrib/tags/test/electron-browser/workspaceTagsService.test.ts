/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, WorkbenchState, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { createFileStat } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceTagsService } from '../../electron-browser/workspaceTagsService.js';

suite('WorkspaceTagsService - Cargo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function collectTags(nestedResult: FileOperationResult, oversized?: 'member' | 'ancestor') {
		const root = URI.parse('test:/repo');
		const nested = URI.joinPath(root, 'nested');
		const members = [URI.joinPath(nested, 'first'), URI.joinPath(nested, 'second')];
		const manifest = (folder: URI) => URI.joinPath(folder, 'Cargo.toml');
		const reads: string[] = [];
		const traces: string[] = [];
		const contents = '[dependencies]\nclient.workspace = true\ntokio = "1"';
		const rootContents = '[workspace]\nmembers = ["nested/*"]\n[workspace.dependencies]\nclient.package = "reqwest"';
		const fileService = upcastPartial<IFileService>({
			exists: async resource => members.some(member => extUri.isEqual(resource, manifest(member))) || extUri.isEqual(resource, manifest(root)),
			resolveAll: async requests => requests.map(({ resource }) => ({
				success: true,
				stat: createFileStat(resource, false, false, true, false, [{ resource: manifest(resource), isFile: true }])
			}))
		});
		const textFileService = upcastPartial<ITextFileService>({
			read: async (resource, options) => {
				reads.push(resource.path);
				if (extUri.isEqual(resource, manifest(nested))) {
					throw new FileOperationError('nested manifest unavailable', nestedResult);
				}
				let value: string;
				if (extUri.isEqual(resource, manifest(root))) {
					value = rootContents;
				} else if (members.some(member => extUri.isEqual(resource, manifest(member)))) {
					value = contents;
				} else {
					throw new Error('Unexpected manifest read');
				}
				if ((oversized === 'ancestor' && extUri.isEqual(resource, manifest(root))) || (oversized === 'member' && members.some(member => extUri.isEqual(resource, manifest(member))))) {
					value += `\n#${'x'.repeat(1024 * 1024)}`;
				}
				if (options?.limits?.size !== undefined && Buffer.byteLength(value) > options.limits.size) {
					throw new FileOperationError('manifest exceeds read limit', FileOperationResult.FILE_TOO_LARGE);
				}
				return { ...createFileStat(resource), encoding: 'utf8', value };
			}
		});
		const workspace = new Workspace('cargo-test', members.map((uri, index) => new WorkspaceFolder({ uri, index, name: `member${index}` })), false, URI.joinPath(root, 'workspace.code-workspace'), () => false);
		const contextService = upcastPartial<IWorkspaceContextService>({ getWorkspace: () => workspace, getWorkbenchState: () => WorkbenchState.WORKSPACE });
		const environmentService = upcastPartial<IWorkbenchEnvironmentService>({ workspaceStorageHome: URI.parse('test:/storage') });
		const uriIdentityService = upcastPartial<IUriIdentityService>({ extUri });
		const logService = store.add(new class extends NullLogService {
			override trace(message: string): void {
				traces.push(message);
			}
		}());
		const service = new WorkspaceTagsService(fileService, contextService, environmentService, textFileService, uriIdentityService, logService);
		const tags = await service.getTags();
		return [
			tags['workspace.cargo.tokio'],
			tags['workspace.cargo.reqwest'],
			reads.filter(path => path === manifest(nested).path).length,
			reads.filter(path => path === manifest(root).path).length,
			traces.length
		];
	}

	test('distinguishes missing ancestor manifests from read failures', async () => {
		assert.deepStrictEqual([
			await collectTags(FileOperationResult.FILE_NOT_FOUND),
			await collectTags(FileOperationResult.FILE_PERMISSION_DENIED)
		], [
			[true, true, 1, 1, 0],
			[true, undefined, 1, 0, 2]
		]);
	});

	test('skips oversized opened and ancestor manifests while preserving direct tags', async () => {
		assert.deepStrictEqual([
			await collectTags(FileOperationResult.FILE_NOT_FOUND, 'member'),
			await collectTags(FileOperationResult.FILE_NOT_FOUND, 'ancestor')
		], [
			[undefined, undefined, 0, 0, 2],
			[true, undefined, 1, 1, 2]
		]);
	});
});
