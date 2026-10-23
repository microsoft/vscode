/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { IgnoreFile, parseGitIgnore } from '../../common/ignoreFile.js';

/**
 * Removes the indentation of the lines of an ignore file, which would
 * otherwise be part of the patterns.
 */
function dedent(contents: string): string {
	return contents.split('\n').map(line => line.trimStart()).join('\n');
}

/**
 * Returns the paths that an ignore file at the root ignores. Paths that end
 * with `/` are directories.
 */
function ignoredPaths(contents: string, paths: string[]): string[] {
	const ignoreFile = new IgnoreFile(contents, '/');

	return paths.filter(path => ignoreFile.isArbitraryPathIgnored(path.endsWith('/') ? path.slice(0, -1) : path, path.endsWith('/')));
}

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
		const i = dedent(`.cache/
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
			*.cpuprofile`);

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
		const i = dedent(`.DS_Store
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
			/.profile-oss`);

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
				assertNoIgnoreMatch(dedent(pattern), '/', include);
			}

			for (const exclude of excluded) {
				assertIgnoreMatch(dedent(pattern), '/', exclude);
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

	test('child negation overrides parent ignore', () => {
		// Simulates: global gitignore has `.myconfig`, project .gitignore has `!.myconfig/`
		// The child negation should override the parent positive pattern.
		const parentIgnore = new IgnoreFile('.myconfig\n', '/');
		const childIgnore = new IgnoreFile('!.myconfig/\n', '/', parentIgnore);

		// The directory should NOT be ignored (child negates parent)
		assert(!childIgnore.isArbitraryPathIgnored('/.myconfig', true),
			'child !.myconfig/ should override parent .myconfig for directories');

		// Files inside the directory should also not be ignored
		assert(!childIgnore.isArbitraryPathIgnored('/.myconfig/settings/test.md', false),
			'files inside un-ignored directory should not be ignored');

		// Parent should still ignore when child has no negation
		const childNoNegation = new IgnoreFile('node_modules/\n', '/', parentIgnore);
		assert(childNoNegation.isArbitraryPathIgnored('/.myconfig', true),
			'without negation, parent ignore should still apply for directories');
		assert(childNoNegation.isArbitraryPathIgnored('/.myconfig/settings/test.md', false),
			'without negation, files under parent-ignored directory should still be ignored');
	});

	test('child negation overrides parent ignore for files', () => {
		// Parent ignores all .log files, child un-ignores important.log
		const parentIgnore = new IgnoreFile('*.log\n', '/');
		const childIgnore = new IgnoreFile('!important.log\n', '/', parentIgnore);

		assert(!childIgnore.isArbitraryPathIgnored('/important.log', false),
			'child !important.log should override parent *.log');
		assert(childIgnore.isArbitraryPathIgnored('/other.log', false),
			'other .log files should still be ignored via parent');
	});

	test('case-insensitive ignore files', () => {
		const f1 = 'node_modules/\n';
		assertNoIgnoreMatch(f1, '/', '/Node_Modules/', false);
		assertIgnoreMatch(f1, '/', '/Node_Modules/', true);

		const f2 = 'NODE_MODULES/\n';
		assertNoIgnoreMatch(f2, '/', '/Node_Modules/', false);
		assertIgnoreMatch(f2, '/', '/Node_Modules/', true);

		const f3 = dedent(`
			temp/*
			!temp/keep
		`);
		assertNoIgnoreMatch(f3, '/', '/TEMP/other', false);
		assertIgnoreMatch(f3, '/', '/temp/KEEP', false);
		assertIgnoreMatch(f3, '/', '/TEMP/other', true);
		assertNoIgnoreMatch(f3, '/', '/TEMP/KEEP', true);
	});

	test('parses the lines of an ignore file', () => {
		assert.deepStrictEqual(parseGitIgnore('# comment\n\n!/out/\nsrc/*.js\n**/foo\nbar\n'), [
			{ negated: true, directoryOnly: true, anchored: true, glob: 'out' },
			{ negated: false, directoryOnly: false, anchored: true, glob: 'src/*.js' },
			{ negated: false, directoryOnly: false, anchored: true, glob: '**/foo' },
			{ negated: false, directoryOnly: false, anchored: false, glob: 'bar' },
		]);
	});

	test('only a leading ! negates a pattern and the last matching pattern decides', () => {
		assert.deepStrictEqual({
			exclamationMark: ignoredPaths('foo!bar\n', ['/foo!bar', '/foobar']),
			escapedExclamationMark: ignoredPaths('\\!important\n', ['/!important', '/important']),
			negationFirst: ignoredPaths('!a.txt\n*.txt\n', ['/a.txt', '/b.txt']),
			ignoredAgain: ignoredPaths('*.txt\n!a.txt\na.txt\n', ['/a.txt', '/b.txt']),
			reincludedFolder: ignoredPaths('/*\n!/src/\n', ['/src/', '/src/a', '/lib/', '/a']),
			reincludedFolders: ignoredPaths('*\n!*/\n!keep.txt\n', ['/keep.txt', '/other.txt', '/dir/', '/dir/keep.txt', '/dir/other.txt']),
		}, {
			exclamationMark: ['/foo!bar'],
			escapedExclamationMark: ['/!important'],
			negationFirst: ['/a.txt', '/b.txt'],
			ignoredAgain: ['/a.txt', '/b.txt'],
			reincludedFolder: ['/lib/', '/a'],
			reincludedFolders: ['/other.txt', '/dir/other.txt'],
		});
	});

	test('matches whitespace, escapes and glob characters like git', () => {
		assert.deepStrictEqual({
			leadingSpace: ignoredPaths(' leading\n', ['/ leading', '/leading']),
			trailingSpaces: ignoredPaths('trailing   \nescaped\\ \n', ['/trailing', '/trailing   ', '/escaped ', '/escaped']),
			lineEndings: ignoredPaths('\uFEFFfirst\r\nsecond\r\n', ['/first', '/second']),
			hash: ignoredPaths('\\#hash\n#comment\n', ['/#hash', '/comment']),
			asterisk: ignoredPaths('\\*star\n', ['/*star', '/xstar']),
			braces: ignoredPaths('{a,b}\n', ['/{a,b}', '/a', '/b']),
			parentheses: ignoredPaths('file (1).txt\n', ['/file (1).txt', '/file 1.txt']),
			backslashes: ignoredPaths('\\\\x\ny\\\n', ['/\\x', '/x', '/y']),
			asterisks: ignoredPaths('a**b\n***/deep\n', ['/axb', '/ab', '/a/x/b', '/deep', '/x/y/deep']),
		}, {
			leadingSpace: ['/ leading'],
			trailingSpaces: ['/trailing', '/escaped '],
			lineEndings: ['/first', '/second'],
			hash: ['/#hash'],
			asterisk: ['/*star'],
			braces: ['/{a,b}'],
			parentheses: ['/file (1).txt'],
			backslashes: ['/\\x'],
			asterisks: ['/axb', '/ab', '/deep', '/x/y/deep'],
		});
	});

	test('matches bracket expressions like git', () => {
		assert.deepStrictEqual({
			negated: ignoredPaths('[!a-c]\n[^x]y\n', ['/a', '/d', '/xy', '/zy']),
			characterClass: ignoredPaths('*[[:digit:]].log\n', ['/a1.log', '/ab.log']),
			closingBracket: ignoredPaths('[]a]\n[\\]]x\n', ['/]', '/a', '/]x', '/ax']),
			reversedRange: ignoredPaths('[z-a]x\n', ['/zx', '/mx']),
			unclosed: ignoredPaths('foo[\n', ['/foo', '/foo[']),
		}, {
			negated: ['/d', '/zy'],
			characterClass: ['/a1.log'],
			closingBracket: ['/]', '/a', '/]x'],
			reversedRange: ['/zx'],
			unclosed: [],
		});
	});

	test('a trailing /** matches everything inside a folder', () => {
		assert.deepStrictEqual({
			reincluded: ignoredPaths('foo/**\n!foo/keep.txt\n', ['/foo/', '/foo/keep.txt', '/foo/other', '/foo/sub/x']),
			// Without a later negation, the folder is skipped as a whole
			skipped: ignoredPaths('build/**\n', ['/build', '/build/', '/build/x']),
			folders: ignoredPaths('foo/**/\n', ['/foo/a/', '/foo/a/x', '/foo/file']),
		}, {
			reincluded: ['/foo/other', '/foo/sub/x'],
			skipped: ['/build/', '/build/x'],
			folders: ['/foo/a/', '/foo/a/x'],
		});
	});

	test('patterns are relative to the location of the ignore file', () => {
		const ignored = (location: string, paths: string[]) => {
			const ignoreFile = new IgnoreFile('/build\nnode_modules\n', location);
			return paths.filter(path => !ignoreFile.isPathIncludedInTraversal(path, true));
		};

		assert.deepStrictEqual({
			withoutTrailingSlash: ignored('/repo', ['/repo/build', '/repo/a/node_modules', '/repo2/build', '/repo2/node_modules']),
			globCharacters: ignored('/[repo] {1}/', ['/[repo] {1}/build', '/[repo] {1}/a/node_modules', '/r/build']),
		}, {
			withoutTrailingSlash: ['/repo/build', '/repo/a/node_modules'],
			globCharacters: ['/[repo] {1}/build', '/[repo] {1}/a/node_modules'],
		});
	});

	test('detects ignore files that ignore every entry of their folder', () => {
		const contents = [
			'# Created by pytest automatically.\n*\n',
			'/*\n',
			'**\n',
			'/**/*\n',
			'!keep.txt\n*\n',
			'*\n!keep.txt\n',
			'*/\n',
			'*.log\n',
			'',
		];

		assert.deepStrictEqual(contents.filter(content => new IgnoreFile(content, '/').ignoresAllEntries), [
			'# Created by pytest automatically.\n*\n',
			'/*\n',
			'**\n',
			'/**/*\n',
			'!keep.txt\n*\n',
		]);
	});
});
