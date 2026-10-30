/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileOnDiskFileSystemProvider } from '../../common/fileOnDiskFileSystemProvider.js';

suite('FileOnDiskFileSystemProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('serves the file on disk readonly', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		disposables.add(fileService.registerProvider(FileOnDiskFileSystemProvider.SCHEME, new FileOnDiskFileSystemProvider(fileService)));

		const resource = URI.file('/workspace/notebook.ipynb');
		await fileService.writeFile(resource, VSBuffer.fromString('content on disk'));

		const fileOnDisk = FileOnDiskFileSystemProvider.toFileOnDisk(resource);
		const stat = await fileService.stat(fileOnDisk);

		assert.deepStrictEqual({
			name: basename(fileOnDisk),
			resource: FileOnDiskFileSystemProvider.fromFileOnDisk(fileOnDisk).toString(),
			content: (await fileService.readFile(fileOnDisk)).value.toString(),
			size: stat.size,
			readonly: stat.readonly
		}, {
			name: 'notebook.ipynb',
			resource: resource.toString(),
			content: 'content on disk',
			size: 'content on disk'.length,
			readonly: true
		});

		await assert.rejects(() => fileService.writeFile(fileOnDisk, VSBuffer.fromString('changed')));
		assert.strictEqual((await fileService.readFile(resource)).value.toString(), 'content on disk');
	});
});
