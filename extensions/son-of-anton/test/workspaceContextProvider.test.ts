/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import {
	isSensitivePath,
	extractOverview,
} from '../src/chat/WorkspaceContextProvider';

// The integrated `WorkspaceContextProvider.collect()` path depends on
// `vscode.window`, `vscode.workspace`, and the Git extension — surfaces that
// would each need extensive stubs to exercise here. We instead lock in the
// behaviour of the two security-and-content-critical helpers: the sensitive
// path matcher (must not leak credentials into chat context) and the README
// overview extractor (must not over-include or empty-string surprise).

suite('WorkspaceContextProvider helpers', () => {
	suite('isSensitivePath', () => {
		test('matches typical sensitive paths and ignores ordinary source files', () => {
			const positives = [
				'foo/bar.env',
				'.env.local',
				'foo/credentials.json',
				'config/secret.yaml',
				'secrets/keys.txt',
				'foo/server.key',
				'certs/private.pem',
				'home/.ssh/id_rsa',
				'.son-of-anton/state.json',
				'project/node_modules/foo/index.js',
				'project/.git/HEAD',
			];
			const negatives = [
				'foo/source.ts',
				'src/index.ts',
				'README.md',
				'docs/usage.md',
				'environments.ts', // similar but not a `.env` file
			];

			assert.deepStrictEqual(
				{
					positives: positives.map(isSensitivePath),
					negatives: negatives.map(isSensitivePath),
				},
				{
					positives: positives.map(() => true),
					negatives: negatives.map(() => false),
				},
			);
		});

		test('treats backslash separators the same as forward slashes', () => {
			assert.deepStrictEqual(
				{
					win: isSensitivePath('foo\\.son-of-anton\\state.json'),
					unix: isSensitivePath('foo/.son-of-anton/state.json'),
				},
				{ win: true, unix: true },
			);
		});
	});

	suite('extractOverview', () => {
		test('returns empty string for an empty README', () => {
			assert.strictEqual(extractOverview(''), '');
		});

		test('extracts the body of an "## Overview" section when present', () => {
			const readme = [
				'# Project',
				'',
				'## Installation',
				'Run npm install.',
				'',
				'## Overview',
				'This is the overview body.',
				'It spans two lines.',
				'',
				'## Usage',
				'Run npm start.',
			].join('\n');

			const result = extractOverview(readme);
			assert.deepStrictEqual(
				{
					hasOverviewBody: result.includes('This is the overview body.'),
					hasSecondLine: result.includes('It spans two lines.'),
					hasUsage: result.includes('Run npm start.'),
					isBlockquote: result.split('\n').every(line => line === '' || line.startsWith('> ')),
				},
				{ hasOverviewBody: true, hasSecondLine: true, hasUsage: false, isBlockquote: true },
			);
		});

		test('also recognises "## Description" as the overview heading', () => {
			const readme = [
				'# Title',
				'',
				'## Description',
				'A description body.',
			].join('\n');

			const result = extractOverview(readme);
			assert.ok(result.includes('A description body.'));
		});

		test('falls back to the first lines when no Overview section exists', () => {
			const lines = ['# My Project', '', 'A short tagline.', '', 'Some intro text.'];
			const readme = lines.join('\n');

			const result = extractOverview(readme);
			assert.deepStrictEqual(
				{
					mentionsTitle: result.includes('My Project'),
					mentionsTagline: result.includes('A short tagline.'),
					isBlockquote: result.split('\n').every(line => line.startsWith('> ')),
				},
				{ mentionsTitle: true, mentionsTagline: true, isBlockquote: true },
			);
		});

		test('caps the fallback at the first 50 lines', () => {
			const longBody = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join('\n');
			const result = extractOverview(longBody);
			const blockquoteLines = result.split('\n');

			assert.deepStrictEqual(
				{
					lineCount: blockquoteLines.length,
					includesLine50: result.includes('Line 50'),
					includesLine51: result.includes('Line 51'),
				},
				{ lineCount: 50, includesLine50: true, includesLine51: false },
			);
		});
	});
});
