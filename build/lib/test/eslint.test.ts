/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { getEslintFilePatterns, getEslintRun, shouldErrorOnUnmatchedPattern } from '../../eslint.ts';
import { eslintFilter } from '../../filters.ts';
import type { CheckScope } from '../changedFiles.ts';

suite('eslint', () => {

	test('uses the full filter when no positional arguments are provided', () => {
		assert.deepStrictEqual(getEslintFilePatterns([]), Array.from(eslintFilter));
	});

	test('uses positional arguments without the full filter', () => {
		const files = ['src/vs/base/common/arrays.ts', 'src/vs/base/common/async.ts'];

		assert.deepStrictEqual(getEslintFilePatterns(files), files);
	});

	test('errors on unmatched positional arguments only', () => {
		assert.deepStrictEqual([
			shouldErrorOnUnmatchedPattern([]),
			shouldErrorOnUnmatchedPattern(['src/vs/base/common/arrays.ts']),
		], [false, true]);
	});

	test('lints the files changed since a revision', () => {
		const bases: string[] = [];
		const run = (args: string[], scope: CheckScope) => getEslintRun(args, base => {
			bases.push(base);
			return scope;
		});

		assert.deepStrictEqual({
			runs: [
				run(['--changed-since', 'abc123'], { kind: 'files', files: ['src/vs/base/common/arrays.ts'], reason: 'changed files' }),
				run(['--changed-since=abc123'], { kind: 'files', files: [], reason: 'changed files' }),
				run(['--changed-since', 'abc123'], { kind: 'full', reason: 'eslint.config.js changed' }),
			],
			bases,
		}, {
			runs: [{
				description: '1 file (changed files)',
				patterns: ['src/vs/base/common/arrays.ts'],
				options: { errorOnUnmatchedPattern: false, globInputPaths: false, warnIgnored: false },
			}, {
				description: '0 files (changed files)',
				patterns: [],
				options: { errorOnUnmatchedPattern: false, globInputPaths: false, warnIgnored: false },
			}, {
				description: 'the full repository because eslint.config.js changed',
				patterns: Array.from(eslintFilter),
				options: { errorOnUnmatchedPattern: false },
			}],
			bases: ['abc123', 'abc123', 'abc123'],
		});
	});

	test('rejects files combined with --changed-since, and an empty revision', () => {
		const unexpectedScope = () => assert.fail('Unexpected scope computation');
		assert.deepStrictEqual([
			['--changed-since', 'abc123', 'src/vs/base/common/arrays.ts'],
			['--changed-since='],
		].map(args => {
			try {
				getEslintRun(args, unexpectedScope);
				return 'no error';
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		}), [
			'Pass either files to lint or --changed-since, not both.',
			'--changed-since requires a git revision.',
		]);
	});
});
