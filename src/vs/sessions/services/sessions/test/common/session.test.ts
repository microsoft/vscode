/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CLAUDE_CODE_SESSION_TYPE, COPILOT_CLI_SESSION_TYPE, COPILOT_CLOUD_SESSION_TYPE, isWorkspaceAgentSessionType, sessionFileChangesEqual } from '../../common/session.js';

suite('isWorkspaceAgentSessionType', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns true for Copilot CLI sessions', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(COPILOT_CLI_SESSION_TYPE), true);
	});

	test('returns true for Claude Code sessions', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(CLAUDE_CODE_SESSION_TYPE), true);
	});

	test('returns false for Copilot Cloud sessions', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(COPILOT_CLOUD_SESSION_TYPE), false);
	});

	test('returns false for unknown session types', () => {
		assert.strictEqual(isWorkspaceAgentSessionType('unknown-type'), false);
	});

	test('returns false for undefined', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(undefined), false);
	});
});

suite('sessionFileChangesEqual', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const fileA = URI.file('/a.txt');
	const fileB = URI.file('/b.txt');
	const fileAOriginal = URI.file('/a.original.txt');
	const fileAModified = URI.file('/a.modified.txt');

	function v1(modifiedUri: URI, insertions = 1, deletions = 1, originalUri?: URI): IChatSessionFileChange {
		return { modifiedUri, originalUri, insertions, deletions };
	}

	function v2(uri: URI, insertions = 1, deletions = 1, originalUri?: URI, modifiedUri?: URI): IChatSessionFileChange2 {
		return { uri, originalUri, modifiedUri, insertions, deletions };
	}

	test('returns true for the same array reference', () => {
		const arr = [v1(fileA)];
		assert.strictEqual(sessionFileChangesEqual(arr, arr), true);
	});

	test('returns true for two empty arrays', () => {
		assert.strictEqual(sessionFileChangesEqual([], []), true);
	});

	test('returns false when lengths differ', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v1(fileA), v1(fileB)]), false);
	});

	test('returns true for structurally equal v1 entries', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v1(fileA, 2, 3, fileAOriginal)],
			[v1(fileA, 2, 3, fileAOriginal)]
		), true);
	});

	test('returns true for structurally equal v2 entries', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v2(fileA, 2, 3, fileAOriginal, fileAModified)],
			[v2(fileA, 2, 3, fileAOriginal, fileAModified)]
		), true);
	});

	test('returns false when insertions differ', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA, 1, 1)], [v1(fileA, 2, 1)]), false);
	});

	test('returns false when deletions differ', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA, 1, 1)], [v1(fileA, 1, 2)]), false);
	});

	test('returns false when one entry is v1 and the other is v2', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v2(fileA)]), false);
	});

	test('returns false when v1 modifiedUri differs', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v1(fileB)]), false);
	});

	test('returns false when v2 uri differs', () => {
		assert.strictEqual(sessionFileChangesEqual([v2(fileA)], [v2(fileB)]), false);
	});

	test('returns false when v2 modifiedUri differs', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v2(fileA, 1, 1, undefined, fileAModified)],
			[v2(fileA, 1, 1, undefined, undefined)]
		), false);
	});

	test('returns false when originalUri differs', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v1(fileA, 1, 1, fileAOriginal)],
			[v1(fileA, 1, 1, undefined)]
		), false);
	});

	test('returns true when entries are the same reference (short-circuit)', () => {
		const shared = v1(fileA);
		assert.strictEqual(sessionFileChangesEqual([shared], [shared]), true);
	});
});
