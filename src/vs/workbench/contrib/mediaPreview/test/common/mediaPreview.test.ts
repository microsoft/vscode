/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { isGitLfsPointer } from '../../common/mediaPreview.js';

suite('Media Preview - isGitLfsPointer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('detects Git LFS pointers only for small git resources', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.git, store.add(new InMemoryFileSystemProvider())));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));

		const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 12345\n';
		const write = async (resource: URI, content: string) => {
			await fileService.writeFile(resource, VSBuffer.fromString(content));
			return resource;
		};

		const gitPointer = await write(URI.from({ scheme: Schemas.git, path: '/pointer.png' }), pointer);
		const gitImage = await write(URI.from({ scheme: Schemas.git, path: '/image.png' }), 'not a pointer');
		const gitLarge = await write(URI.from({ scheme: Schemas.git, path: '/large.png' }), pointer + 'x'.repeat(2048));
		const filePointer = await write(URI.from({ scheme: Schemas.file, path: '/pointer.png' }), pointer);
		const missing = URI.from({ scheme: Schemas.git, path: '/missing.png' });

		assert.deepStrictEqual(await Promise.all([gitPointer, gitImage, gitLarge, filePointer, missing].map(resource => isGitLfsPointer(fileService, resource))), [
			true,
			false,
			false,
			false,
			false,
		]);
	});
});
