/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { createInMemoryFileService } from '../../../../../platform/files/test/common/inMemoryFileService.js';
import { canMergeFolders, getMergeFileEdits } from '../../browser/fileImportExport.js';

suite('Files - Merge folders', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('merges folders that exist in the target and replaces everything else', async () => {
		const fileService = createInMemoryFileService(store);
		const uri = (path: string) => URI.from({ scheme: Schemas.inMemory, path });
		for (const path of [
			'/source/folder/a.txt',
			'/source/folder/new/b.txt',
			'/source/folder/sub/c.txt',
			'/source/folder/fileInTarget/d.txt',
			'/source/file.txt',
			'/target/folder/a.txt',
			'/target/folder/sub/existing.txt',
			'/target/folder/fileInTarget',
			'/target/file.txt'
		]) {
			await fileService.writeFile(uri(path), VSBuffer.fromString(path));
		}

		const toSnapshot = (edits: ResourceFileEdit[]) => edits.map(edit => ({ from: edit.oldResource?.path, to: edit.newResource?.path, options: edit.options }));
		const sources = [uri('/source/folder'), uri('/source/file.txt')];

		assert.deepStrictEqual({
			canMerge: [
				await canMergeFolders(fileService, uri('/source/folder'), uri('/target/folder')),
				await canMergeFolders(fileService, uri('/source/folder/fileInTarget'), uri('/target/folder/fileInTarget')),
				await canMergeFolders(fileService, uri('/source/file.txt'), uri('/target/file.txt'))
			],
			move: toSnapshot(await getMergeFileEdits(fileService, sources, uri('/target'), false)),
			copy: toSnapshot(await getMergeFileEdits(fileService, sources, uri('/target'), true))
		}, {
			canMerge: [true, false, false],
			move: [
				{ from: '/source/folder/a.txt', to: '/target/folder/a.txt', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/new', to: '/target/folder/new', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/sub/c.txt', to: '/target/folder/sub/c.txt', options: { overwrite: true, copy: false } },
				{ from: '/source/folder/sub', to: undefined, options: { folder: true, skipTrashBin: true } },
				{ from: '/source/folder/fileInTarget', to: '/target/folder/fileInTarget', options: { overwrite: true, copy: false } },
				{ from: '/source/folder', to: undefined, options: { folder: true, skipTrashBin: true } },
				{ from: '/source/file.txt', to: '/target/file.txt', options: { overwrite: true, copy: false } }
			],
			copy: [
				{ from: '/source/folder/a.txt', to: '/target/folder/a.txt', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/new', to: '/target/folder/new', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/sub/c.txt', to: '/target/folder/sub/c.txt', options: { overwrite: true, copy: true } },
				{ from: '/source/folder/fileInTarget', to: '/target/folder/fileInTarget', options: { overwrite: true, copy: true } },
				{ from: '/source/file.txt', to: '/target/file.txt', options: { overwrite: true, copy: true } }
			]
		});
	});
});
