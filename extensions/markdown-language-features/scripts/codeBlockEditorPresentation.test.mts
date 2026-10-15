/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeBlockEditorPresentation } from '../src/preview/markdownEditorProtocol.ts';

test('presentation RPC schema preserves explicit false and optional preferences', () => {
	const options = { resizable: true, fullWidth: false, fullView: true, minHeight: 120 };
	assert.deepEqual(codeBlockEditorPresentation.parse(options), options);
	assert.deepEqual(codeBlockEditorPresentation.parse({}), {});
});

test('presentation RPC schema rejects invalid preferences and heights', () => {
	for (const value of [null, { fullView: 'true' }, { minHeight: 0 }, { minHeight: -1 }, { minHeight: Infinity }, { minHeight: NaN }, { minHeight: 10_001 }]) {
		assert.equal(codeBlockEditorPresentation.safeParse(value).success, false);
	}
});
