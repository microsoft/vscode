/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../common/files.js';
import { InMemoryFileSystemProvider } from '../../common/inMemoryFilesystemProvider.js';

suite('InMemoryFileSystemProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/image.png');

	for (const append of [false, true]) {
		test(`exclusive open preserves an existing file (append: ${append})`, async () => {
			const provider = store.add(new InMemoryFileSystemProvider());
			await provider.writeFile(resource, VSBuffer.fromString('existing').buffer, { create: true, overwrite: true, unlock: false, atomic: false });
			await assert.rejects(async () => provider.open(resource, { create: true, overwrite: false, append, unlock: false }), error =>
				error instanceof Error && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileExists);
			assert.strictEqual(VSBuffer.wrap(await provider.readFile(resource)).toString(), 'existing');
		});
	}

	test('exclusive open creates a new file', async () => {
		const provider = store.add(new InMemoryFileSystemProvider());
		const handle = await provider.open(resource, { create: true, overwrite: false, unlock: false });
		const data = VSBuffer.fromString('new image');
		try {
			await provider.write(handle, 0, data.buffer, 0, data.byteLength);
		} finally {
			await provider.close(handle);
		}
		assert.strictEqual(VSBuffer.wrap(await provider.readFile(resource)).toString(), 'new image');
	});
});
