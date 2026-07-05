/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { projectDisplayName } from '../../common/projectDisplayName.js';

suite('projectDisplayName', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the workspace folder display name when set (the normal desktop case)', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'Acme Brief', basename: 'brief' }), 'Acme Brief');
	});

	test('falls back to the basename when no folder name is set', () => {
		assert.strictEqual(projectDisplayName({ basename: 'brief' }), 'brief');
	});

	test('a web/memfs "mount" stub WITH a marker shows the sample name', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'mount', basename: 'mount', markerContent: 'Project Brief\n' }), 'Project Brief');
	});

	test('the "static" stub is also overridden by a marker', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'static', basename: 'static', markerContent: 'Living Docs Sample' }), 'Living Docs Sample');
	});

	test('a "mount" stub WITHOUT a marker keeps its real name (never fabricated)', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'mount', basename: 'mount' }), 'mount');
	});

	test('an arbitrary folder genuinely named "mount" but shipping no marker still shows "mount" (honest basename)', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'mount', basename: 'mount', markerContent: '' }), 'mount');
	});

	test('a real (non-stub) folder is NEVER overridden by a marker', () => {
		// A marker only overrides a mount stub; a folder with a genuine name wins over any stray marker.
		assert.strictEqual(projectDisplayName({ folderName: 'Q3 Plan', basename: 'q3', markerContent: 'Something Else' }), 'Q3 Plan');
	});

	test('the marker takes its first non-empty, non-comment line and trims it', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'mount', markerContent: '# comment\n\n  Real Name  \nsecond line\n' }), 'Real Name');
	});

	test('a mount stub with a comment-only / whitespace-only marker falls back to the stub name', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'mount', markerContent: '# just a comment\n\n   \n' }), 'mount');
	});

	test('the stub match is case-insensitive', () => {
		assert.strictEqual(projectDisplayName({ folderName: 'Mount', markerContent: 'Sample' }), 'Sample');
	});

	test('returns undefined when nothing is known (no folder open)', () => {
		assert.strictEqual(projectDisplayName({}), undefined);
	});
});
