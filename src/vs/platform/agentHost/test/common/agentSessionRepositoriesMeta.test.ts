/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readRepositoryDetectionOptions, readSessionRepositories, VSCODE_SESSION_REPOSITORIES_META_KEY, withSessionRepositories } from '../../common/meta/agentSessionRepositoriesMeta.js';

suite('Agent session repositories metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the repositories of each folder, bounded, dropping malformed entries, and round-trips them', () => {
		const many = Array.from({ length: 70 }, (_, index) => ({ root: `file:///work/repo${index}`, kind: 'nested' }));
		const meta = {
			'vscode.other': 1,
			[VSCODE_SESSION_REPOSITORIES_META_KEY]: {
				work: [{ root: 'file:///work', kind: 'folder' }, { root: 'file:///work/docs', kind: 'nested', extra: true }, { root: '', kind: 'nested' }, { root: 'file:///work/x', kind: 'unknown' }, 'not an entry'],
				many,
				malformed: 'not a list',
			},
		};
		const read = readSessionRepositories(meta);

		assert.deepStrictEqual({
			work: read?.work,
			many: read?.many.length,
			malformed: read?.malformed,
			absent: readSessionRepositories({}),
			notAnObject: readSessionRepositories({ [VSCODE_SESSION_REPOSITORIES_META_KEY]: ['file:///work'] }),
			roundTrip: readSessionRepositories(withSessionRepositories({ 'vscode.other': 1 }, { work: read!.work })),
			keepsOtherMeta: withSessionRepositories({ 'vscode.other': 1 }, {})?.['vscode.other'],
		}, {
			work: [{ root: 'file:///work', kind: 'folder' }, { root: 'file:///work/docs', kind: 'nested' }],
			many: 64,
			malformed: undefined,
			absent: undefined,
			notAnObject: undefined,
			roundTrip: { work: [{ root: 'file:///work', kind: 'folder' }, { root: 'file:///work/docs', kind: 'nested' }] },
			keepsOtherMeta: 1,
		});
	});

	test('reads the repository detection options of each folder, dropping malformed entries', () => {
		const valid = { scanSubfolders: true, scanMaxDepth: 1, scanIgnoredFolders: ['node_modules'], detectSubmodules: false };
		const sourceControl = { ...valid, detectSubmodulesLimit: 3, scanRepositories: ['tools/repo'], ignoredRepositories: ['vendor'] };

		assert.deepStrictEqual({
			read: readRepositoryDetectionOptions({
				valid,
				sourceControl,
				fractionalLimit: { ...sourceControl, detectSubmodulesLimit: 2.5 },
				badScanRepositories: { ...sourceControl, scanRepositories: 'tools' },
				badIgnoredRepositories: { ...sourceControl, ignoredRepositories: [null] },
				fractionalDepth: { ...valid, scanMaxDepth: 1.5 },
				badIgnored: { ...valid, scanIgnoredFolders: [1] },
				missingSubmodules: { scanSubfolders: true, scanMaxDepth: 1, scanIgnoredFolders: [] },
				notAnObject: true,
			}),
			notAMap: readRepositoryDetectionOptions(['valid']),
			absent: readRepositoryDetectionOptions(undefined),
		}, {
			// The fields of a later client are optional
			read: { valid, sourceControl },
			notAMap: {},
			absent: {},
		});
	});
});
