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
				operations: [{
					id: 'added:2:2:2:3',
					changeType: 'added',
					original: { start: 2, end: 2 },
					modified: { start: 2, end: 3 },
				}],
			},
			deleted: {
				added: [],
				changed: [],
				originalChanged: [],
				deleted: [{ start: 1, end: 2 }],
				operations: [{
					id: 'deleted:1:2:1:1',
					changeType: 'deleted',
					original: { start: 1, end: 2 },
					modified: { start: 1, end: 1 },
				}],
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
				operations: [
					{
						id: 'changed:1:2:1:2',
						changeType: 'changed',
						original: { start: 1, end: 2 },
						modified: { start: 1, end: 2 },
					},
					{
						id: 'added:2:2:2:3',
						changeType: 'added',
						original: { start: 2, end: 2 },
						modified: { start: 2, end: 3 },
					},
				],
			},
			moreOriginal: {
				added: [],
				changed: [{ start: 1, end: 2 }],
				originalChanged: [{ start: 1, end: 2 }],
				deleted: [{ start: 2, end: 3 }],
				operations: [
					{
						id: 'changed:1:2:1:2',
						changeType: 'changed',
						original: { start: 1, end: 2 },
						modified: { start: 1, end: 2 },
					},
					{
						id: 'deleted:2:3:2:2',
						changeType: 'deleted',
						original: { start: 2, end: 3 },
						modified: { start: 2, end: 2 },
					},
				],
			},
		});
	});

	test('uses zero-based end-exclusive ranges with trailing newlines', () => {
		assert.deepStrictEqual(computeLineChangeRanges('a\nb\n', 'a\nx\n'), {
			added: [],
			changed: [{ start: 1, end: 2 }],
			originalChanged: [{ start: 1, end: 2 }],
			deleted: [],
			operations: [{
				id: 'changed:1:2:1:2',
				changeType: 'changed',
				original: { start: 1, end: 2 },
				modified: { start: 1, end: 2 },
			}],
		});
	});
});
