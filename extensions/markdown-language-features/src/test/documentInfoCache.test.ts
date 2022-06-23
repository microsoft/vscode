/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { MdDocumentInfoCache } from '../util/workspaceCache';
import { InMemoryMdWorkspace } from './inMemoryWorkspace';
import { workspacePath } from './util';

suite('DocumentInfoCache', () => {
	test('Repeated calls should only compute value once', async () => {
		const doc = workspacePath('doc.md');
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(doc, '')
		]);

		let i = 0;
		const cache = new MdDocumentInfoCache<number>(workspace, async () => {
			return ++i;
		});

		const a = cache.get(doc);
		const b = cache.get(doc);

		assert.strictEqual(await a, 1);
		assert.strictEqual(i, 1);
		assert.strictEqual(await b, 1);
		assert.strictEqual(i, 1);
	});
});
