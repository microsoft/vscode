/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileType, IFileService, IStat } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { BulkFileEdits } from '../../../bulkEdit/browser/bulkFileEdits.js';
import { canMergeFolders, getMergeFileEdits } from '../../browser/fileImportExport.js';

const symbolicLink = '/target/folder/link';

/**
 * Reports {@link symbolicLink} as a symbolic link to the folder stored at that path.
 */
class SymbolicLinkFileSystemProvider extends InMemoryFileSystemProvider {
	override async stat(resource: URI): Promise<IStat> {
		const stat = await super.stat(resource);
		return resource.path === symbolicLink ? { ...stat, type: stat.type | FileType.SymbolicLink } : stat;
	}
}

suite('Files - Merge folders', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const uri = (path: string) => URI.from({ scheme: Schemas.inMemory, path });

	async function createFileService(): Promise<FileService> {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new SymbolicLinkFileSystemProvider())));
		for (const path of [
			'/source/folder/a.txt',
			'/source/folder/new/b.txt',
			'/source/folder/fileInTarget/d.txt',
			'/source/folder/link/e.txt',
			'/source/folder/sub/c.txt',
			'/source/file.txt',
			'/target/folder/a.txt',
			'/target/folder/fileInTarget',
			'/target/folder/link/f.txt',
			'/target/folder/sub/existing.txt',
			'/target/file.txt',
			'/target/other.txt'
		]) {
			await fileService.writeFile(uri(path), VSBuffer.fromString(path));
		}

		return fileService;
	}

	async function readTree(fileService: IFileService, resource: URI): Promise<string[]> {
		const stat = await fileService.resolve(resource);
		if (!stat.isDirectory) {
			return [`${resource.path} = ${(await fileService.readFile(resource)).value.toString()}`];
		}

		const entries = stat.children?.length ? [] : [`${resource.path}/`];
		for (const child of stat.children ?? []) {
			entries.push(...await readTree(fileService, child.resource));
		}

		return entries.sort();
	}

	test('only offers to merge folders into folders that are not symbolic links', async () => {
		const fileService = await createFileService();

		assert.deepStrictEqual([
			await canMergeFolders(fileService, uri('/source/folder'), uri('/target/folder')),
			await canMergeFolders(fileService, uri('/source/folder/fileInTarget'), uri('/target/folder/fileInTarget')),
			await canMergeFolders(fileService, uri('/source/folder/link'), uri(symbolicLink)),
			await canMergeFolders(fileService, uri('/source/file.txt'), uri('/target/file.txt'))
		], [true, false, false, false]);
	});

	for (const copy of [false, true]) {
		test(`applying the merge edits of a ${copy ? 'copy' : 'move'} merges existing folders and replaces everything else`, async () => {
			const fileService = await createFileService();
			const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, store);
			const edits = await getMergeFileEdits(fileService, [uri('/source/folder'), uri('/source/file.txt')], uri('/target'), copy);

			await instantiationService.createInstance(BulkFileEdits, 'Merge', 'merge', new UndoRedoGroup(), undefined, false, Progress.None, CancellationToken.None, edits).apply();

			const source = copy ? [
				'/source/file.txt = /source/file.txt',
				'/source/folder/a.txt = /source/folder/a.txt',
				'/source/folder/fileInTarget/d.txt = /source/folder/fileInTarget/d.txt',
				'/source/folder/link/e.txt = /source/folder/link/e.txt',
				'/source/folder/new/b.txt = /source/folder/new/b.txt',
				'/source/folder/sub/c.txt = /source/folder/sub/c.txt'
			] : ['/source/'];
			assert.deepStrictEqual(await readTree(fileService, uri('/')), [
				...source,
				'/target/file.txt = /source/file.txt',
				'/target/folder/a.txt = /source/folder/a.txt',
				'/target/folder/fileInTarget/d.txt = /source/folder/fileInTarget/d.txt',
				'/target/folder/link/e.txt = /source/folder/link/e.txt',
				'/target/folder/new/b.txt = /source/folder/new/b.txt',
				'/target/folder/sub/c.txt = /source/folder/sub/c.txt',
				'/target/folder/sub/existing.txt = /target/folder/sub/existing.txt',
				'/target/other.txt = /target/other.txt'
			]);
		});
	}
});
