/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import { suite, test } from 'vitest';

import { computeLineChangeRanges } from '../lineChangeRanges';

suite('Line change ranges', () => {
	test('maps additions and deletions to their respective snapshots', () => {
		assert.deepStrictEqual({
			added: computeLineChangeRanges('a\nb', 'a\nb\nc'),
			deleted: computeLineChangeRanges('a\nb\nc', 'a\nc'),
		}, {
			added: {
				added: [{ start: 2, end: 3 }],
				changed: [],
				originalChanged: [],
				deleted: [],
			},
			deleted: {
				added: [],
				changed: [],
				originalChanged: [],
				deleted: [{ start: 1, end: 2 }],
			},
		});
	});

	test('splits unequal replacements into changed and surplus ranges', () => {
		assert.deepStrictEqual({
			moreModified: computeLineChangeRanges('a\nb\nc', 'a\nx\ny\nc'),
			moreOriginal: computeLineChangeRanges('a\nb\nc\nd', 'a\nx\nd'),
		}, {
			moreModified: {
				added: [{ start: 2, end: 3 }],
				changed: [{ start: 1, end: 2 }],
				originalChanged: [{ start: 1, end: 2 }],
				deleted: [],
			},
			moreOriginal: {
				added: [],
				changed: [{ start: 1, end: 2 }],
				originalChanged: [{ start: 1, end: 2 }],
				deleted: [{ start: 2, end: 3 }],
			},
		});
	});

	test('uses zero-based end-exclusive ranges with trailing newlines', () => {
		assert.deepStrictEqual(computeLineChangeRanges('a\nb\n', 'a\nx\n'), {
			added: [],
			changed: [{ start: 1, end: 2 }],
			originalChanged: [{ start: 1, end: 2 }],
			deleted: [],
		});
	});
});
