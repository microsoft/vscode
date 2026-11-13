/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import es from 'event-stream';
import path from 'path';
import VinylFile from 'vinyl';
import { suite, test } from 'node:test';
import { filter } from '../gulp/facade.ts';

function filterPaths(paths: readonly string[], pattern: string[], options?: { dot?: boolean }): Promise<string[]> {
	const cwd = process.cwd();
	return new Promise((resolve, reject) => {
		const matched: string[] = [];
		es.readArray(paths.map(p => new VinylFile({ cwd, base: cwd, path: path.join(cwd, p) })))
			.pipe(filter(pattern, options))
			.on('data', (file: VinylFile) => matched.push(file.relative.replace(/\\/g, '/')))
			.on('end', () => resolve(matched))
			.on('error', reject);
	});
}

suite('gulp facade filter', () => {

	test('applies the patterns in order, like gulp-filter', async () => {
		const paths = ['a.ts', 'a.md', 'docs/keep.md', 'docs/drop.md', '.github/x.yml'];
		assert.deepStrictEqual({
			ordered: await filterPaths(paths, ['**', '!**/*.md', 'docs/keep.md']),
			negatedFirst: await filterPaths(paths, ['!**/*.md', '**/*.ts']),
			dot: await filterPaths(paths, ['**', '!**/*.md'], { dot: true }),
		}, {
			ordered: ['a.ts', 'docs/keep.md'],
			negatedFirst: ['a.ts'],
			dot: ['a.ts', '.github/x.yml'],
		});
	});
});
