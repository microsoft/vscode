/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../files/common/files.js';
import { createInMemoryFileService } from '../../../../files/test/common/inMemoryFileService.js';
import { codexDirectoryHasHooks } from '../../../node/codex/codexFolderPickerCriteria.js';

suite('codexDirectoryHasHooks', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fileService: IFileService;

	setup(() => {
		fileService = createInMemoryFileService(disposables, Schemas.inMemory);
	});


	const has = (path: string) => codexDirectoryHasHooks(fileService, URI.from({ scheme: Schemas.inMemory, path }));

	test('qualifies only when a .codex/hooks.json manifest is present', async () => {
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/withHooks/.codex/hooks.json' }), VSBuffer.fromString('{}'));
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/otherFile/.codex/config.json' }), VSBuffer.fromString('{}'));

		assert.deepStrictEqual({
			present: await has('/withHooks'),
			otherFileOnly: await has('/otherFile'),
			missing: await has('/nothing'),
		}, {
			present: true,
			otherFileOnly: false,
			missing: false,
		});
	});
});
