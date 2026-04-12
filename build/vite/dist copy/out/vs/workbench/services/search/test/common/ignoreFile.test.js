/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IgnoreFile } from '../../common/ignoreFile.js';
function runAssert(input, ignoreFile, ignoreFileLocation, shouldMatch, traverse, ignoreCase) {
    return (prefix) => {
        const isDir = input.endsWith('/');
        const rawInput = isDir ? input.slice(0, input.length - 1) : input;
        const matcher = new IgnoreFile(ignoreFile, prefix + ignoreFileLocation, undefined, ignoreCase);
        if (traverse) {
            const traverses = matcher.isPathIncludedInTraversal(prefix + rawInput, isDir);
            if (shouldMatch) {
                assert(traverses, `${ignoreFileLocation}: ${ignoreFile} should traverse ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
            }
            else {
                assert(!traverses, `${ignoreFileLocation}: ${ignoreFile} should not traverse ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
            }
        }
        else {
            const ignores = matcher.isArbitraryPathIgnored(prefix + rawInput, isDir);
            if (shouldMatch) {
                assert(ignores, `${ignoreFileLocation}: ${ignoreFile} should ignore ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
            }
            else {
                assert(!ignores, `${ignoreFileLocation}: ${ignoreFile} should not ignore ${isDir ? 'dir' : 'file'} ${prefix}${rawInput}`);
            }
        }
    };
}
function assertNoTraverses(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
    const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, false, true, ignoreCase);
    runWithPrefix('');
    runWithPrefix('/someFolder');
}
function assertTraverses(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
    const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, true, true, ignoreCase);
    runWithPrefix('');
    runWithPrefix('/someFolder');
}
function assertIgnoreMatch(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
    const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, true, false, ignoreCase);
    runWithPrefix('');
    runWithPrefix('/someFolder');
}
function assertNoIgnoreMatch(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
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
        const runTest = ({ pattern, included, excluded }) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWdub3JlRmlsZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L2NvbW1vbi9pZ25vcmVGaWxlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUV4RCxTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsVUFBa0IsRUFBRSxrQkFBMEIsRUFBRSxXQUFvQixFQUFFLFFBQWlCLEVBQUUsVUFBbUI7SUFDN0ksT0FBTyxDQUFDLE1BQWMsRUFBRSxFQUFFO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFFbEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxVQUFVLENBQUMsVUFBVSxFQUFFLE1BQU0sR0FBRyxrQkFBa0IsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDL0YsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLEdBQUcsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTlFLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxrQkFBa0IsS0FBSyxVQUFVLG9CQUFvQixL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