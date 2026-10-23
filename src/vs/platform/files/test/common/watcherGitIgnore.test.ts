/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../common/fileService.js';
import { InMemoryFileSystemProvider } from '../../common/inMemoryFilesystemProvider.js';
import { parseWatcherPatterns } from '../../common/watcher.js';
import { getWatcherExcludesFromGitIgnore, readGitIgnoreWatcherExcludes } from '../../common/watcherGitIgnore.js';

suite('Watcher .gitignore excludes', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('converts patterns relative to the watched folder', () => {
		assert.deepStrictEqual(getWatcherExcludesFromGitIgnore([
			'# Cargo output',
			'/target/',
			'/target',
			'node_modules',
			'.local/',
			'*.log',
			'src/generated/',
			'/build/*.o',
			'**/coverage',
			'foo/**',
			'',
		].join('\n')), [
			'target', 'target/**',
			'**/node_modules', '**/node_modules/**',
			'**/.local', '**/.local/**',
			'**/*.log', '**/*.log/**',
			'src/generated', 'src/generated/**',
			'build/*.o', 'build/*.o/**',
			'**/coverage', '**/coverage/**',
			'foo/**',
		]);
	});

	test('skips patterns that could exclude paths git does not ignore', () => {
		assert.deepStrictEqual(getWatcherExcludesFromGitIgnore([
			'dist/',
			'*.log',
			'!important.log',
			'target/',
			' leading-space',
			'\\#not-a-comment',
			'{a,b}',
			'file (1).txt',
			'*',
			'/*',
			'**/*',
			'.*',
			'.gitignore',
			'out',
		].join('\r\n')), ['**/target', '**/target/**', '**/out', '**/out/**']);
	});

	test('excludes match the expected paths of the watched folder', () => {
		const folder = URI.file('/repo').fsPath;
		const excludes = parseWatcherPatterns(folder, getWatcherExcludesFromGitIgnore('/target/\nnode_modules/\n'), false);
		const isExcluded = (path: string) => excludes.some(exclude => exclude(join(folder, path)));

		const paths = ['target', 'target/debug/build.rs', 'src/target', 'target.rs', 'node_modules', 'packages/a/node_modules/x/index.js', 'src/main.rs', '.gitignore'];
		assert.deepStrictEqual(paths.filter(isExcluded), ['target', 'target/debug/build.rs', 'node_modules', 'packages/a/node_modules/x/index.js']);
	});

	test('reads the .gitignore file at the root of the folder', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const folder = URI.from({ scheme: Schemas.inMemory, path: '/repo' });

		const missing = await readGitIgnoreWatcherExcludes(fileService, folder);
		await fileService.writeFile(joinPath(folder, '.gitignore'), VSBuffer.fromString('/target/\n'));
		const present = await readGitIgnoreWatcherExcludes(fileService, folder);

		assert.deepStrictEqual({ missing, present }, { missing: [], present: ['target', 'target/**'] });
	});
});
