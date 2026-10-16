/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeBlockEditorPresentation, mergeCodeBlockEditorPresentation } from '../src/preview/markdownEditorProtocol.ts';

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

test('undefined resolved preferences inherit defaults while explicit false overrides them', () => {
	const contributed = { resizable: true, fullWidth: false, fullView: true, minHeight: 160 };
	assert.deepEqual(mergeCodeBlockEditorPresentation(contributed, {
		resizable: false,
		fullWidth: undefined,
		fullView: false,
		minHeight: undefined,
	}), { resizable: false, fullWidth: false, fullView: false, minHeight: 160 });
	assert.deepEqual(mergeCodeBlockEditorPresentation(contributed, {
		resizable: undefined,
		fullWidth: true,
		fullView: undefined,
		minHeight: 240,
	}), { resizable: true, fullWidth: true, fullView: true, minHeight: 240 });
});

test('missing presentation preference objects preserve the available preferences', () => {
	const preferences = { fullView: false, minHeight: 160 };
	assert.deepEqual({
		neither: mergeCodeBlockEditorPresentation(undefined, undefined),
		contributed: mergeCodeBlockEditorPresentation(preferences, undefined),
		resolved: mergeCodeBlockEditorPresentation(undefined, preferences),
		empty: mergeCodeBlockEditorPresentation({}, {}),
	}, {
		neither: undefined,
		contributed: preferences,
		resolved: preferences,
		empty: { resizable: undefined, fullWidth: undefined, fullView: undefined, minHeight: undefined },
	});
});
