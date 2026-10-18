/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { joinPath } from '../../../../base/common/resources.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { HTMLFileSystemProvider } from '../../browser/htmlFileSystemProvider.js';

suite('HTMLFileSystemProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves registered and nested directory handles', async () => {
		const nestedHandle = upcastPartial<FileSystemDirectoryHandle>({
			kind: 'directory',
			name: 'nested',
		});
		const rootHandle = upcastPartial<FileSystemDirectoryHandle>({
			kind: 'directory',
			name: 'root',
			getDirectoryHandle: async name => {
				if (name === nestedHandle.name) {
					return nestedHandle;
				}
				throw new DOMException('Not found', 'NotFoundError');
			},
		});
		const provider = disposables.add(new HTMLFileSystemProvider(undefined, 'test', new NullLogService()));
		const rootResource = await provider.registerDirectoryHandle(rootHandle);

		assert.deepStrictEqual({
			root: await provider.getDirectoryHandle(rootResource) === rootHandle,
			nested: await provider.getDirectoryHandle(joinPath(rootResource, nestedHandle.name)) === nestedHandle,
		}, {
			root: true,
			nested: true,
		});
	});
});
