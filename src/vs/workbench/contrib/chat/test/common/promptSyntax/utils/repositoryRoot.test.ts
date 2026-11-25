/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { isEqual } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { findRepositoryRoot } from '../../../../common/promptSyntax/utils/repositoryRoot.js';

suite('findRepositoryRoot', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home/me');

	test('stops at the same folders as the parent repository search', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		await fileService.createFolder(URI.file('/repo/.git'));
		await fileService.writeFile(URI.file('/worktree/.git'), VSBuffer.fromString('gitdir: /repo/.git/worktrees/w'));
		await fileService.createFolder(URI.file('/home/me/.git'));

		const rootOf = async (path: string, stopAt?: string) => (await findRepositoryRoot(fileService, URI.file(path), userHome, stopAt ? folder => folder.path === stopAt : undefined))?.path;
		assert.deepStrictEqual({
			nested: await rootOf('/repo/packages/app'),
			gitFile: await rootOf('/worktree/src'),
			notARepository: await rootOf('/other/folder'),
			insideHomeRepository: await rootOf('/home/me/project'),
			homeRepository: await rootOf('/home/me'),
			stopAtFolder: await rootOf('/repo/packages/app', '/repo'),
		}, {
			nested: '/repo',
			gitFile: '/worktree',
			notARepository: undefined,
			insideHomeRepository: undefined,
			homeRepository: '/home/me',
			stopAtFolder: undefined,
		});
	});

	test('stops when a .git entry cannot be read', async () => {
		const fileService: Pick<IFileService, 'stat'> = {
			stat: async resource => {
				if (isEqual(resource, URI.file('/repo/.git'))) {
					return { isDirectory: true, isFile: false } as Awaited<ReturnType<IFileService['stat']>>;
				}
				const result = isEqual(resource, URI.file('/repo/locked/.git')) ? FileOperationResult.FILE_PERMISSION_DENIED : FileOperationResult.FILE_NOT_FOUND;
				throw new FileOperationError('stat failed', result);
			}
		};
		assert.deepStrictEqual({
			readable: (await findRepositoryRoot(fileService, URI.file('/repo/open/app'), userHome))?.path,
			unreadable: (await findRepositoryRoot(fileService, URI.file('/repo/locked/app'), userHome))?.path,
		}, {
			readable: '/repo',
			unreadable: undefined,
		});
	});
});
