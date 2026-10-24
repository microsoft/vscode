/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import 'mocha';
import { resolvePreviewPosition, resolvePreviewState } from '../preview/previewScrollState';

suite('previewScrollState', () => {

	const resource = 'file:///workspace/readme.md';

	test('restores the position of the previous run of the preview', () => {
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource, line: 200 },
				{ resource },
				{ line: undefined, fragment: undefined }),
			{ kind: 'restored', line: 200 });
	});

	test('restores the position even when the render asks for another line', () => {
		// The line of the render is the line that the preview was opened at. It is outdated
		// when the preview has been scrolled since the render was made.
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource, line: 200 },
				{ resource },
				{ line: 0, fragment: undefined }),
			{ kind: 'restored', line: 200 });
	});

	test('shows the requested line when there is no position to restore', () => {
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource },
				{ resource },
				{ line: 42, fragment: undefined }),
			{ kind: 'line', line: 42 });
	});

	test('starts at the top when there is neither a position nor a requested line', () => {
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource },
				{ resource },
				{ line: undefined, fragment: undefined }),
			{ kind: 'start' });
	});

	test('does not restore the position of another document', () => {
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource: 'file:///workspace/other.md', line: 200 },
				{ resource },
				{ line: 42, fragment: undefined }),
			{ kind: 'line', line: 42 });
	});

	test('shows the requested fragment', () => {
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource, line: 200 },
				{ resource },
				{ line: 0, fragment: 'section' }),
			{ kind: 'fragment', fragment: 'section' });
	});

	test('does not restore an invalid position', () => {
		deepStrictEqual(
			resolvePreviewPosition(
				{ resource, line: NaN },
				{ resource },
				{ line: 42, fragment: undefined }),
			{ kind: 'line', line: 42 });
	});

	test('keeps the restored position as the anchor of the scroll position', () => {
		deepStrictEqual(
			resolvePreviewState(
				{ resource, line: 200 },
				{ resource },
				{ line: 0, fragment: undefined }).state,
			{ resource, line: 200, fragment: undefined });
	});

	test('does not keep the position of another document', () => {
		deepStrictEqual(
			resolvePreviewState(
				{ resource, line: 200 },
				{ resource: 'file:///workspace/other.md' },
				{ line: 42, fragment: undefined }).state,
			{ resource: 'file:///workspace/other.md', line: undefined, fragment: undefined });
	});

	test('keeps the requested fragment', () => {
		deepStrictEqual(
			resolvePreviewState(
				{ resource, line: 200 },
				{ resource },
				{ line: 0, fragment: 'section' }).state,
			{ resource, line: undefined, fragment: 'section' });
	});
});
