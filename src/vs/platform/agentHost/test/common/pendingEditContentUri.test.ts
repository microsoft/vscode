/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildPendingEditContentUri, parsePendingEditContentUri } from '../../common/pendingEditContentUri.js';

suite('PendingEditContentUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies the session of a proposed edit', () => {
		const session = 'ahp-session:/known-session';
		const uri = buildPendingEditContentUri(session, 'tool/id', '/workspace/space and ünicode.txt');
		assert.deepStrictEqual(parsePendingEditContentUri(uri.toString()), { sessionUri: session });
	});

	test('rejects malformed or non-content references', () => {
		const valid = buildPendingEditContentUri('ahp-session:/known-session', 'tool', '/file');
		for (const uri of [
			valid.with({ scheme: 'file' }),
			valid.with({ authority: 'invalid' }),
			valid.with({ authority: '123' }),
			valid.with({ authority: '' }),
			valid.with({ path: '/tool/not-hex' }),
			valid.with({ path: '/tool/abcd/extra' }),
			valid.with({ path: '//abcd' }),
			valid.with({ query: 'extra' }),
			valid.with({ fragment: 'extra' }),
		]) {
			assert.strictEqual(parsePendingEditContentUri(uri.toString()), undefined);
		}
	});
});
