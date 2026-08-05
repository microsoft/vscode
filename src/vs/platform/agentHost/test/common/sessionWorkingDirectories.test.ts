/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { areWorkingDirectoriesEqual, resolveSessionWorkingDirectoryAction } from '../../common/state/sessionWorkingDirectories.js';

suite('Session working directories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const primary = 'file:///workspace/primary';
	const secondary = 'file:///workspace/secondary';

	test('compares additional working directories as a set', () => {
		const first = [URI.file('/workspace/a'), URI.file('/workspace/b')];
		const second = [URI.file('/workspace/b'), URI.file('/workspace/a')];

		assert.strictEqual(areWorkingDirectoriesEqual(first, second), true);
	});

	test('compares an immutable primary positionally and additional directories as a set', () => {
		const first = [URI.file('/workspace/primary'), URI.file('/workspace/a'), URI.file('/workspace/b')];
		const reorderedAdditional = [URI.file('/workspace/primary'), URI.file('/workspace/b'), URI.file('/workspace/a')];
		const changedPrimary = [URI.file('/workspace/a'), URI.file('/workspace/primary'), URI.file('/workspace/b')];

		assert.deepStrictEqual([
			areWorkingDirectoriesEqual(first, reorderedAdditional, true),
			areWorkingDirectoriesEqual(first, changedPrimary, true),
		], [true, false]);
	});

	test('uses an existing canonical spelling for equivalent set and remove actions', () => {
		const encodedEquivalent = 'file:///workspace/%73econdary';

		assert.deepStrictEqual([
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: encodedEquivalent },
				[primary, secondary],
			),
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: encodedEquivalent },
				[primary, secondary],
			),
		], [
			{ type: ActionType.SessionWorkingDirectorySet, directory: secondary },
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: secondary },
		]);
	});

	test('canonicalizes new sets and absent removes', () => {
		assert.deepStrictEqual([
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: 'file:///workspace/%61dded' },
				[primary, secondary],
			),
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///workspace/%61bsent' },
				[primary, secondary],
			),
		], [
			{ type: ActionType.SessionWorkingDirectorySet, directory: 'file:///workspace/added' },
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///workspace/absent' },
		]);
	});

	test('rejects removal of the immutable primary', () => {
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///workspace/%70rimary' },
				[primary, secondary],
			),
			/The primary working directory cannot be removed/,
		);
	});

	test('rejects malformed and non-file URIs', () => {
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: 'not a URI' },
				[primary],
			),
			/Scheme is missing/,
		);
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: 'vscode-remote://ssh-remote+host/workspace' },
				[primary],
			),
			/Working directory must be a file URI/,
		);
	});
});
