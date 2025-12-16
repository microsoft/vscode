/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IgnoreFile } from '../../common/ignoreFile.js';

function runAssert(input: string, ignoreFile: string, ignoreFileLocation: string, shouldMatch: boolean, traverse: boolean, ignoreCase: boolean) {
	return (prefix: string) => {
		const isDir = input.endsWith('/');
		const rawInput = isDir ? input.slice(0, input.length - 1) : input;

		const matcher = new IgnoreFile(ignoreFile, prefix + ignoreFileLocation, undefined, ignoreCase);
		if (traverse) {
			const traverses = matcher.isPathIncludedInTraversal(prefix + rawInput, isDir);

			if (shouldMatch) {
				assert(traverses, `${ignoreFileLocation}: ${ignoreFile} should traverse ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
			} else {
				assert(!traverses, `${ignoreFileLocation}: ${ignoreFile} should not traverse ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
			}
		}
		else {
			const ignores = matcher.isArbitraryPathIgnored(prefix + rawInput, isDir);

			if (shouldMatch) {
				assert(ignores, `${ignoreFileLocation}: ${ignoreFile} should ignore ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
			} else {
				assert(!ignores, `${ignoreFileLocation}: ${ignoreFile} should not ignore ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
			}
		}
	};
}

function assertNoTraverses(ignoreFile: string, ignoreFileLocation: string, input: string, ignoreCase = false) {
	const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, false, true, ignoreCase);

	runWithPrefix('');
	runWithPrefix('/someFolder');
}

function assertTraverses(ignoreFile: string, ignoreFileLocation: string, input: string, ignoreCase = false) {
	const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, true, true, ignoreCase);

	runWithPrefix('');
	runWithPrefix('/someFolder');
}

function assertIgnoreMatch(ignoreFile: string, ignoreFileLocation: string, input: string, ignoreCase = false) {
	const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, true, false, ignoreCase);

	runWithPrefix('');
	runWithPrefix('/someFolder');
}

function assertNoIgnoreMatch(ignoreFile: string, ignoreFileLocation: string, input: string, ignoreCase = false) {
	const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, false, false, ignoreCase);

	runWithPrefix('');
	runWithPrefix('/someFolder');
}

suite('Parsing .gitignore files', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('paths with trailing slashes do not match files', () => {
		const i = 'node_modules/\n';

		assertNoIgnoreMatch(i, '/', '/node_modules');
		assertIgnoreMatch(i, '/', '/node_modules/');

		assertNoIgnoreMatch(i, '/', '/inner/node_modules');
		assertIgnoreMatch(i, '/', '/inner/node_modules/');
	});

	test('parsing simple gitignore files', () => {
		let i = 'node_modules\nout\n';

		assertIgnoreMatch(i, '/', '/node_modules');
		assertNoTraverses(i, '/', '/node_modules');
		assertIgnoreMatch(i, '/', '/node_modules/file');
		assertIgnoreMatch(i, '/', '/dir/node_modules');
		assertIgnoreMatch(i, '/', '/dir/node_modules/file');

		assertIgnoreMatch(i, '/', '/out');
		assertNoTraverses(i, '/', '/out');
		assertIgnoreMatch(i, '/', '/out/file');
		assertIgnoreMatch(i, '/', '/dir/out');
		assertIgnoreMatch(i, '/', '/dir/out/file');

		i = '/node_modules\n/out\n';

		assertIgnoreMatch(i, '/', '/node_modules');
		assertIgnoreMatch(i, '/', '/node_modules/file');
		assertNoIgnoreMatch(i, '/', '/dir/node_modules');
		assertNoIgnoreMatch(i, '/', '/dir/node_modules/file');

		assertIgnoreMatch(i, '/', '/out');
		assertIgnoreMatch(i, '/', '/out/file');
		assertNoIgnoreMatch(i, '/', '/dir/out');
		assertNoIgnoreMatch(i, '/', '/dir/out/file');

		i = 'node_modules/\nout/\n';

		assertNoIgnoreMatch(i, '/', '/node_modules');
		assertIgnoreMatch(i, '/', '/node_modules/');
		assertIgnoreMatch(i, '/', '/node_modules/file');
		assertIgnoreMatch(i, '/', '/dir/node_modules/');
		assertNoIgnoreMatch(i, '/', '/dir/node_modules');
		assertIgnoreMatch(i, '/', '/dir/node_modules/file');

		assertIgnoreMatch(i, '/', '/out/');
		assertNoIgnoreMatch(i, '/', '/out');
		assertIgnoreMatch(i, '/', '/out/file');
		assertNoIgnoreMatch(i, '/', '/dir/out');
		assertIgnoreMatch(i, '/', '/dir/out/');
		assertIgnoreMatch(i, '/', '/dir/out/file');
	});

	test('parsing files-in-folder exclude', () => {
		let i = 'node_modules/*\n';

		assertNoIgnoreMatch(i, '/', '/node_modules');
		assertNoIgnoreMatch(i, '/', '/node_modules/');
		assertTraverses(i, '/', '/node_modules');
		assertTraverses(i, '/', '/node_modules/');
		assertIgnoreMatch(i, '/', '/node_modules/something');
		assertNoTraverses(i, '/', '/node_modules/something');
		assertIgnoreMatch(i, '/', '/node_modules/something/else');
		assertIgnoreMatch(i, '/', '/node_modules/@types');
		assertNoTraverses(i, '/', '/node_modules/@types');

		i = 'node_modules/**/*\n';

		assertNoIgnoreMatch(i, '/', '/node_modules');
		assertNoIgnoreMatch(i, '/', '/node_modules/');
		assertIgnoreMatch(i, '/', '/node_modules/something');
		assertIgnoreMatch(i, '/', '/node_modules/something/else');
		assertIgnoreMatch(i, '/', '/node_modules/@types');
	});

	test('parsing simple negations', () => {
		let i = 'node_modules/*\n!node_modules/@types\n';

		assertNoIgnoreMatch(i, '/', '/node_modules');
		assertTraverses(i, '/', '/node_modules');

		assertIgnoreMatch(i, '/', '/node_modules/something');
		assertNoTraverses(i, '/', '/node_modules/something');
		assertIgnoreMatch(i, '/', '/node_modules/something/else');

		assertNoIgnoreMatch(i, '/', '/node_modules/@types');
		assertTraverses(i, '/', '/node_modules/@types');
		assertTraverses(i, '/', '/node_modules/@types/boop');

		i = '*.log\n!important.log\n';

		assertIgnoreMatch(i, '/', '/test.log');
		assertIgnoreMatch(i, '/', '/inner/test.log');

		assertNoIgnoreMatch(i, '/', '/important.log');
		assertNoIgnoreMatch(i, '/', '/inner/important.log');

		assertNoTraverses(i, '/', '/test.log');
		assertNoTraverses(i, '/', '/inner/test.log');
		assertTraverses(i, '/', '/important.log');
		assertTraverses(i, '/', '/inner/important.log');
	});

	test('nested .gitignores', () => {
		let i = 'node_modules\nout\n';

		assertIgnoreMatch(i, '/inner/', '/inner/node_modules');
		assertIgnoreMatch(i, '/inner/', '/inner/more/node_modules');


		i = '/node_modules\n/out\n';

		assertIgnoreMatch(i, '/inner/', '/inner/node_modules');
		assertNoIgnoreMatch(i, '/inner/', '/inner/more/node_modules');
		assertNoIgnoreMatch(i, '/inner/', '/node_modules');

		i = 'node_modules/\nout/\n';

		assertNoIgnoreMatch(i, '/inner/', '/inner/node_modules');
		assertIgnoreMatch(i, '/inner/', '/inner/node_modules/');
		assertNoIgnoreMatch(i, '/inner/', '/inner/more/node_modules');
		assertIgnoreMatch(i, '/inner/', '/inner/more/node_modules/');
		assertNoIgnoreMatch(i, '/inner/', '/node_modules');
	});

	test('file extension matches', () => {
		let i = '*.js\n';

		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/myFile.js');

		i = '/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.js');

		i = '**/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/more/myFile.js');

		i = 'inner/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.js');

		i = '/inner/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.js');

		i = '**/inner/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.js');

		i = '**/inner/**/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/more/myFile.js');

		i = '**/more/*.js';
		assertNoIgnoreMatch(i, '/', '/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.ts');
		assertNoIgnoreMatch(i, '/', '/inner/myFile.js');
		assertNoIgnoreMatch(i, '/', '/inner/more/myFile.ts');
		assertIgnoreMatch(i, '/', '/inner/more/myFile.js');
	});

	test('real world example: vscode-js-debug', () => {
		const i = `.cache/
			.profile/
			.cdp-profile/
			.headless-profile/
			.vscode-test/
			.DS_Store
			node_modules/
			out/
			dist
			/coverage
			/.nyc_output
			demos/web-worker/vscode-pwa-dap.log
			demos/web-worker/vscode-pwa-cdp.log
			.dynamic-testWorkspace
			**/test/**/*.actual
			/testWorkspace/web/tmp
			/testWorkspace/**/debug.log
			/testWorkspace/webview/win/true/
			*.cpuprofile`;

		const included = [
			'/distro',

			'/inner/coverage',
			'/inner/.nyc_output',

			'/inner/demos/web-worker/vscode-pwa-dap.log',
			'/inner/demos/web-worker/vscode-pwa-cdp.log',

			'/testWorkspace/webview/win/true',

			'/a/best/b/c.actual',
			'/best/b/c.actual',
		];

		const excluded = [
			'/.profile/',
			'/inner/.profile/',

			'/.DS_Store',
			'/inner/.DS_Store',

			'/coverage',
			'/.nyc_output',

			'/demos/web-worker/vscode-pwa-dap.log',
			'/demos/web-worker/vscode-pwa-cdp.log',

			'/.dynamic-testWorkspace',
			'/inner/.dynamic-testWorkspace',

			'/test/.actual',
			'/test/hello.actual',
			'/a/test/.actual',
			'/a/test/b.actual',
			'/a/test/b/.actual',
			'/a/test/b/c.actual',
			'/a/b/test/.actual',
			'/a/b/test/f/c.actual',

			'/testWorkspace/web/tmp',

			'/testWorkspace/debug.log',
			'/testWorkspace/a/debug.log',
			'/testWorkspace/a/b/debug.log',

			'/testWorkspace/webview/win/true/',

			'/.cpuprofile',
			'/a.cpuprofile',
			'/aa/a.cpuprofile',
			'/aaa/aa/a.cpuprofile',
		];

		for (const include of included) {
			assertNoIgnoreMatch(i, '/', include);
		}

		for (const exclude of excluded) {
			assertIgnoreMatch(i, '/', exclude);
		}
	});

	test('real world example: vscode', () => {
		const i = `.DS_Store
			.cache
			npm-debug.log
			Thumbs.db
			node_modules/
			.build/
			extensions/**/dist/
			/out*/
			/extensions/**/out/
			src/vs/server
			resources/server
			build/node_modules
			coverage/
			test_data/
			test-results/
			yarn-error.log
			vscode.lsif
			vscode.db
			/.profile-oss`;

		const included = [
			'/inner/extensions/dist',
			'/inner/extensions/boop/dist/test',
			'/inner/extensions/boop/doop/dist',
			'/inner/extensions/boop/doop/dist/test',
			'/inner/extensions/boop/doop/dist/test',

			'/inner/extensions/out/test',
			'/inner/extensions/boop/out',
			'/inner/extensions/boop/out/test',

			'/inner/out/',
			'/inner/out/test',
			'/inner/out1/',
			'/inner/out1/test',
			'/inner/out2/',
			'/inner/out2/test',

			'/inner/.profile-oss',

			// Files.
			'/extensions/dist',
			'/extensions/boop/doop/dist',
			'/extensions/boop/out',
		];

		const excluded = [
			'/extensions/dist/',
			'/extensions/boop/dist/test',
			'/extensions/boop/doop/dist/',
			'/extensions/boop/doop/dist/test',
			'/extensions/boop/doop/dist/test',

			'/extensions/out/test',
			'/extensions/boop/out/',
			'/extensions/boop/out/test',

			'/out/',
			'/out/test',
			'/out1/',
			'/out1/test',
			'/out2/',
			'/out2/test',

			'/.profile-oss',
		];

		for (const include of included) {
			assertNoIgnoreMatch(i, '/', include);
		}

		for (const exclude of excluded) {
			assertIgnoreMatch(i, '/', exclude);
		}

	});

	test('various advanced constructs found in popular repos', () => {
		const runTest = ({ pattern, included, excluded }: { pattern: string; included: string[]; excluded: string[] }) => {
			for (const include of included) {
				assertNoIgnoreMatch(pattern, '/', include);
			}

			for (const exclude of excluded) {
				assertIgnoreMatch(pattern, '/', exclude);
			}
		};

		runTest({
			pattern: `**/node_modules
			/packages/*/dist`,

			excluded: [
				'/node_modules',
				'/test/node_modules',
				'/node_modules/test',
				'/test/node_modules/test',

				'/packages/a/dist',
				'/packages/abc/dist',
				'/packages/abc/dist/test',
			],
			included: [
				'/inner/packages/a/dist',
				'/inner/packages/abc/dist',
				'/inner/packages/abc/dist/test',

				'/packages/dist',
				'/packages/dist/test',
				'/packages/a/b/dist',
				'/packages/a/b/dist/test',
			],
		});

		runTest({
			pattern: `.yarn/*
			# !.yarn/cache
			!.yarn/patches
			!.yarn/plugins
			!.yarn/releases
			!.yarn/sdks
			!.yarn/versions`,

			excluded: [
				'/.yarn/test',
				'/.yarn/cache',
			],
			included: [
				'/inner/.yarn/test',
				'/inner/.yarn/cache',

				'/.yarn/patches',
				'/.yarn/plugins',
				'/.yarn/releases',
				'/.yarn/sdks',
				'/.yarn/versions',
			],
		});

		runTest({
			pattern: `[._]*s[a-w][a-z]
			[._]s[a-w][a-z]
			*.un~
			*~`,

			excluded: [
				'/~',
				'/abc~',
				'/inner/~',
				'/inner/abc~',
				'/.un~',
				'/a.un~',
				'/test/.un~',
				'/test/a.un~',
				'/.saa',
				'/....saa',
				'/._._sby',
				'/inner/._._sby',
				'/_swz',
			],
			included: [
				'/.jaa',
			],
		});

		// TODO: the rest of these :)
		runTest({
			pattern: `*.pbxuser
			!default.pbxuser
			*.mode1v3
			!default.mode1v3
			*.mode2v3
			!default.mode2v3
			*.perspectivev3
			!default.perspectivev3`,
			excluded: [],
			included: [],
		});

		runTest({
			pattern: `[Dd]ebug/
			[Dd]ebugPublic/
			[Rr]elease/
			[Rr]eleases/
			*.[Mm]etrics.xml
			[Tt]est[Rr]esult*/
			[Bb]uild[Ll]og.*
			bld/
			[Bb]in/
			[Oo]bj/
			[Ll]og/`,
			excluded: [],
			included: [],
		});

		runTest({
			pattern: `Dockerfile*
			!/tests/bud/*/Dockerfile*
			!/tests/conformance/**/Dockerfile*`,
			excluded: [],
			included: [],
		});

		runTest({
			pattern: `*.pdf
			*.html
			!author_bio.html
			!colo.html
			!copyright.html
			!cover.html
			!ix.html
			!titlepage.html
			!toc.html`,
			excluded: [],
			included: [],
		});

		runTest({
			pattern: `/log/*
			/tmp/*
			!/log/.keep
			!/tmp/.keep`,
			excluded: [],
			included: [],
		});

	});

	test('case-insensitive ignore files', () => {
		const f1 = 'node_modules/\n';
		assertNoIgnoreMatch(f1, '/', '/Node_Modules/', false);
		assertIgnoreMatch(f1, '/', '/Node_Modules/', true);

		const f2 = 'NODE_MODULES/\n';
		assertNoIgnoreMatch(f2, '/', '/Node_Modules/', false);
		assertIgnoreMatch(f2, '/', '/Node_Modules/', true);

		const f3 = `
			temp/*
			!temp/keep
		`;
		assertNoIgnoreMatch(f3, '/', '/TEMP/other', false);
		assertIgnoreMatch(f3, '/', '/temp/KEEP', false);
		assertIgnoreMatch(f3, '/', '/TEMP/other', true);
		assertNoIgnoreMatch(f3, '/', '/TEMP/KEEP', true);
	});
});
