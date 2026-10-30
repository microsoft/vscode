/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { readNewChatDraftState, writeNewChatDraftState } from '../../common/newChatDraftState.js';

suite('New chat draft state', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the references that bind mentions to attachments, and reads drafts saved without them', () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = { kind: 'file' as const, id: 'a', name: 'index.ts', value: URI.file('/a/index.ts') };
		const second = { kind: 'file' as const, id: 'b', name: 'index.ts', value: URI.file('/b/index.ts') };
		const references = [
			{ id: 'b', range: new Range(1, 1, 1, 21), data: second.value, isFile: true, isAttachmentReference: true },
			{ id: 'a', range: new Range(1, 26, 1, 46), data: first.value, isFile: true, isAttachmentReference: true },
		];
		writeNewChatDraftState(storageService, { inputText: '#attachment:index.ts and #attachment:index.ts', attachments: [first, second], references });
		const draft = readNewChatDraftState(storageService);

		// A draft without pills keeps no references, as drafts saved before them did.
		writeNewChatDraftState(storageService, { inputText: 'hello', attachments: [] });
		const withoutReferences = readNewChatDraftState(storageService);

		assert.deepStrictEqual({
			references: draft?.references?.map(reference => ({ id: reference.id, range: Range.lift(reference.range), data: URI.isUri(reference.data) ? reference.data.path : undefined })),
			withoutReferences,
		}, {
			references: [
				{ id: 'b', range: new Range(1, 1, 1, 21), data: '/b/index.ts' },
				{ id: 'a', range: new Range(1, 26, 1, 46), data: '/a/index.ts' },
			],
			withoutReferences: { inputText: 'hello', attachments: [], references: undefined },
		});
	});
});
