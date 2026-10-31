/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { areAdditionalWorkingDirectoriesEqual, areSessionWorkingDirectoriesEqual, resolveSessionWorkingDirectoryAction } from '../../common/state/sessionWorkingDirectories.js';

suite('Session working directories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const primary = 'file:///workspace/primary';
	const secondary = 'file:///workspace/secondary';
	const replacement = 'file:///workspace/replacement';
	const capImmutable = { immutablePrimary: true, primaryReplacement: false };
	const capReplaceablePrimary = { immutablePrimary: true, primaryReplacement: true };
	const capReplaceablePrimaryOnly = { immutablePrimary: false, primaryReplacement: true };
	const capNone = { immutablePrimary: false, primaryReplacement: false };

	test('compares additional working directories as an unordered set', () => {
		const first = [URI.file('/workspace/a'), URI.file('/workspace/b')];
		const second = [URI.file('/workspace/b'), URI.file('/workspace/a')];

		assert.strictEqual(areAdditionalWorkingDirectoriesEqual(first, second), true);
	});

	test('compares the session primary positionally and additional directories as a set', () => {
		const first = [URI.file('/workspace/primary'), URI.file('/workspace/a'), URI.file('/workspace/b')];
		const reorderedAdditional = [URI.file('/workspace/primary'), URI.file('/workspace/b'), URI.file('/workspace/a')];
		const changedPrimary = [URI.file('/workspace/a'), URI.file('/workspace/primary'), URI.file('/workspace/b')];

		assert.deepStrictEqual([
			areSessionWorkingDirectoriesEqual(first, reorderedAdditional, true),
			areSessionWorkingDirectoriesEqual(first, changedPrimary, true),
		], [true, false]);
	});

	test('compares every directory as an equal peer without an immutable primary', () => {
		const first = [URI.file('/workspace/primary'), URI.file('/workspace/a')];
		const reordered = [URI.file('/workspace/a'), URI.file('/workspace/primary')];
		const different = [URI.file('/workspace/a'), URI.file('/workspace/b')];

		assert.deepStrictEqual([
			areSessionWorkingDirectoriesEqual(first, reordered, false),
			areSessionWorkingDirectoriesEqual(first, different, false),
		], [true, false]);
	});

	test('uses an existing canonical spelling for equivalent set and remove actions', () => {
		const encodedEquivalent = 'file:///workspace/%73econdary';

		assert.deepStrictEqual([
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: encodedEquivalent },
				[primary, secondary],
				capImmutable,
			),
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: encodedEquivalent },
				[primary, secondary],
				capImmutable,
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
				capImmutable,
			),
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///workspace/%61bsent' },
				[primary, secondary],
				capImmutable,
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
				capImmutable,
			),
			/The primary working directory cannot be removed/,
		);
	});

	test('rejects removal of index zero when the provider advertises primaryReplacement without immutablePrimary', () => {
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: primary },
				[primary, secondary],
				capReplaceablePrimaryOnly,
			),
			/The primary working directory cannot be removed/,
		);
	});

	test('allows removal of index zero when the provider has no immutable primary', () => {
		assert.deepStrictEqual(
			resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: primary },
				[primary, secondary],
				capNone,
			),
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: primary },
		);
	});

	test('rejects malformed and non-file URIs', () => {
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: 'not a URI' },
				[primary],
				capImmutable,
			),
			/Scheme is missing/,
		);
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{ type: ActionType.SessionWorkingDirectorySet, directory: 'vscode-remote://ssh-remote+host/workspace' },
				[primary],
				capImmutable,
			),
			/Working directory must be a file URI/,
		);
	});

	test('canonicalizes both directory and replacement in a replace action', () => {
		assert.deepStrictEqual(
			resolveSessionWorkingDirectoryAction(
				{
					type: ActionType.SessionWorkingDirectoryReplaced,
					directory: 'file:///workspace/%73econdary',
					replacement: 'file:///workspace/%72eplacement',
				},
				[primary, secondary, replacement],
				capImmutable,
			),
			{
				type: ActionType.SessionWorkingDirectoryReplaced,
				directory: secondary,
				replacement,
			},
		);
	});

	test('accepts a replace with no matching target as a canonicalized no-op payload', () => {
		assert.deepStrictEqual(
			resolveSessionWorkingDirectoryAction(
				{
					type: ActionType.SessionWorkingDirectoryReplaced,
					directory: 'file:///workspace/absent',
					replacement,
				},
				[primary, secondary],
				capImmutable,
			),
			{
				type: ActionType.SessionWorkingDirectoryReplaced,
				directory: 'file:///workspace/absent',
				replacement,
			},
		);
	});

	test('rejects replace when the primary is immutable without primaryReplacement', () => {
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{
					type: ActionType.SessionWorkingDirectoryReplaced,
					directory: primary,
					replacement,
				},
				[primary, secondary],
				capImmutable,
			),
			/The primary working directory cannot be replaced/,
		);
	});

	test('allows primary replace when the provider advertises primaryReplacement', () => {
		assert.deepStrictEqual(
			resolveSessionWorkingDirectoryAction(
				{
					type: ActionType.SessionWorkingDirectoryReplaced,
					directory: primary,
					replacement,
				},
				[primary, secondary],
				capReplaceablePrimary,
			),
			{
				type: ActionType.SessionWorkingDirectoryReplaced,
				directory: primary,
				replacement,
			},
		);
	});

	test('rejects a replace with a non-file replacement URI', () => {
		assert.throws(
			() => resolveSessionWorkingDirectoryAction(
				{
					type: ActionType.SessionWorkingDirectoryReplaced,
					directory: secondary,
					replacement: 'vscode-remote://ssh-remote+host/workspace',
				},
				[primary, secondary],
				capImmutable,
			),
			/Working directory replacement must be a file URI/,
		);
	});
});
