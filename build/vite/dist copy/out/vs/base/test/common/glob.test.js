/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as glob from '../../common/glob.js';
import { sep } from '../../common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../common/platform.js';
import { URI } from '../../common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('Glob', () => {
    // test('perf', () => {
    // 	let patterns = [
    // 		'{**/*.cs,**/*.json,**/*.csproj,**/*.sln}',
    // 		'{**/*.cs,**/*.csproj,**/*.sln}',
    // 		'{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs}',
    // 		'**/*.go',
    // 		'{**/*.ps,**/*.ps1}',
    // 		'{**/*.c,**/*.cpp,**/*.h}',
    // 		'{**/*.fsx,**/*.fsi,**/*.fs,**/*.ml,**/*.mli}',
    // 		'{**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs}',
    // 		'{**/*.ts,**/*.tsx}',
    // 		'{**/*.php}',
    // 		'{**/*.php}',
    // 		'{**/*.php}',
    // 		'{**/*.php}',
    // 		'{**/*.py}',
    // 		'{**/*.py}',
    // 		'{**/*.py}',
    // 		'{**/*.rs,**/*.rslib}',
    // 		'{**/*.cpp,**/*.cc,**/*.h}',
    // 		'{**/*.md}',
    // 		'{**/*.md}',
    // 		'{**/*.md}'
    // 	];
    // 	let paths = [
    // 		'/DNXConsoleApp/Program.cs',
    // 		'C:\\DNXConsoleApp\\foo\\Program.cs',
    // 		'test/qunit',
    // 		'test/test.txt',
    // 		'test/node_modules',
    // 		'.hidden.txt',
    // 		'/node_module/test/foo.js'
    // 	];
    // 	let results = 0;
    // 	let c = 1000;
    // 	console.profile('glob.match');
    // 	while (c-- > 0) {
    // 		for (let path of paths) {
    // 			for (let pattern of patterns) {
    // 				let r = glob.match(pattern, path);
    // 				if (r) {
    // 					results += 42;
    // 				}
    // 			}
    // 		}
    // 	}
    // 	console.profileEnd();
    // });
    function assertGlobMatch(pattern, input, ignoreCase) {
        assert(glob.match(pattern, input, { ignoreCase }), `${JSON.stringify(pattern)} should match ${input}`);
        assert(glob.match(pattern, nativeSep(input), { ignoreCase }), `${pattern} should match ${nativeSep(input)}`);
    }
    function assertNoGlobMatch(pattern, input, ignoreCase) {
        assert(!glob.match(pattern, input, { ignoreCase }), `${pattern} should not match ${input}`);
        assert(!glob.match(pattern, nativeSep(input), { ignoreCase }), `${pattern} should not match ${nativeSep(input)}`);
    }
    test('simple', () => {
        let p = 'node_modules';
        assertGlobMatch(p, 'node_modules');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, '/node_modules');
        assertNoGlobMatch(p, 'test/node_modules');
        p = 'test.txt';
        assertGlobMatch(p, 'test.txt');
        assertNoGlobMatch(p, 'test?txt');
        assertNoGlobMatch(p, '/text.txt');
        assertNoGlobMatch(p, 'test/test.txt');
        p = 'test(.txt';
        assertGlobMatch(p, 'test(.txt');
        assertNoGlobMatch(p, 'test?txt');
        p = 'qunit';
        assertGlobMatch(p, 'qunit');
        assertNoGlobMatch(p, 'qunit.css');
        assertNoGlobMatch(p, 'test/qunit');
        // Absolute
        p = '/DNXConsoleApp/**/*.cs';
        assertGlobMatch(p, '/DNXConsoleApp/Program.cs');
        assertGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');
        p = 'C:/DNXConsoleApp/**/*.cs';
        assertGlobMatch(p, 'C:\\DNXConsoleApp\\Program.cs');
        assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.cs');
        p = '*';
        assertGlobMatch(p, '');
    });
    test('dot hidden', function () {
        let p = '.*';
        assertGlobMatch(p, '.git');
        assertGlobMatch(p, '.hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden.txt');
        assertNoGlobMatch(p, 'path/.git');
        assertNoGlobMatch(p, 'path/.hidden.txt');
        p = '**/.*';
        assertGlobMatch(p, '.git');
        assertGlobMatch(p, '/.git');
        assertGlobMatch(p, '.hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden.txt');
        assertGlobMatch(p, 'path/.git');
        assertGlobMatch(p, 'path/.hidden.txt');
        assertGlobMatch(p, '/path/.git');
        assertGlobMatch(p, '/path/.hidden.txt');
        assertNoGlobMatch(p, 'path/git');
        assertNoGlobMatch(p, 'pat.h/hidden.txt');
        p = '._*';
        assertGlobMatch(p, '._git');
        assertGlobMatch(p, '._hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden.txt');
        assertNoGlobMatch(p, 'path/._git');
        assertNoGlobMatch(p, 'path/._hidden.txt');
        p = '**/._*';
        assertGlobMatch(p, '._git');
        assertGlobMatch(p, '._hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden._txt');
        assertGlobMatch(p, 'path/._git');
        assertGlobMatch(p, 'path/._hidden.txt');
        assertGlobMatch(p, '/path/._git');
        assertGlobMatch(p, '/path/._hidden.txt');
        assertNoGlobMatch(p, 'path/git');
        assertNoGlobMatch(p, 'pat.h/hidden._txt');
    });
    test('file pattern', function () {
        let p = '*.js';
        assertGlobMatch(p, 'foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        p = 'html.*';
        assertGlobMatch(p, 'html.js');
        assertGlobMatch(p, 'html.txt');
        assertNoGlobMatch(p, 'htm.txt');
        p = '*.*';
        assertGlobMatch(p, 'html.js');
        assertGlobMatch(p, 'html.txt');
        assertGlobMatch(p, 'htm.txt');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        p = 'node_modules/test/*.js';
        assertGlobMatch(p, 'node_modules/test/foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_module/test/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
    });
    test('star', () => {
        let p = 'node*modules';
        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, 'node_super_modules');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, '/node_modules');
        assertNoGlobMatch(p, 'test/node_modules');
        p = '*';
        assertGlobMatch(p, 'html.js');
        assertGlobMatch(p, 'html.txt');
        assertGlobMatch(p, 'htm.txt');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
    });
    test('file / folder match', function () {
        const p = '**/node_modules/**';
        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, 'node_modules/');
        assertGlobMatch(p, 'a/node_modules');
        assertGlobMatch(p, 'a/node_modules/');
        assertGlobMatch(p, 'node_modules/foo');
        assertGlobMatch(p, 'foo/node_modules/foo/bar');
        assertGlobMatch(p, '/node_modules');
        assertGlobMatch(p, '/node_modules/');
        assertGlobMatch(p, '/a/node_modules');
        assertGlobMatch(p, '/a/node_modules/');
        assertGlobMatch(p, '/node_modules/foo');
        assertGlobMatch(p, '/foo/node_modules/foo/bar');
    });
    test('questionmark', () => {
        let p = 'node?modules';
        assertGlobMatch(p, 'node_modules');
        assertNoGlobMatch(p, 'node_super_modules');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, '/node_modules');
        assertNoGlobMatch(p, 'test/node_modules');
        p = '?';
        assertGlobMatch(p, 'h');
        assertNoGlobMatch(p, 'html.txt');
        assertNoGlobMatch(p, 'htm.txt');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
    });
    test('globstar', () => {
        let p = '**/*.js';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, '/foo.js');
        assertGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        assertNoGlobMatch(p, '/some.js/test');
        assertNoGlobMatch(p, '\\some.js\\test');
        p = '**/project.json';
        assertGlobMatch(p, 'project.json');
        assertGlobMatch(p, '/project.json');
        assertGlobMatch(p, 'some/folder/project.json');
        assertGlobMatch(p, '/some/folder/project.json');
        assertNoGlobMatch(p, 'some/folder/file_project.json');
        assertNoGlobMatch(p, 'some/folder/fileproject.json');
        assertNoGlobMatch(p, 'some/rrproject.json');
        assertNoGlobMatch(p, 'some\\rrproject.json');
        p = 'test/**';
        assertGlobMatch(p, 'test');
        assertGlobMatch(p, 'test/foo');
        assertGlobMatch(p, 'test/foo/');
        assertGlobMatch(p, 'test/foo.js');
        assertGlobMatch(p, 'test/other/foo.js');
        assertNoGlobMatch(p, 'est/other/foo.js');
        p = '**';
        assertGlobMatch(p, '/');
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, 'folder/foo/');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertGlobMatch(p, 'foo.jss');
        assertGlobMatch(p, 'some.js/test');
        p = 'test/**/*.js';
        assertGlobMatch(p, 'test/foo.js');
        assertGlobMatch(p, 'test/other/foo.js');
        assertGlobMatch(p, 'test/other/more/foo.js');
        assertNoGlobMatch(p, 'test/foo.ts');
        assertNoGlobMatch(p, 'test/other/foo.ts');
        assertNoGlobMatch(p, 'test/other/more/foo.ts');
        p = '**/**/*.js';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, '/foo.js');
        assertGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        p = '**/node_modules/**/*.js';
        assertNoGlobMatch(p, 'foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, 'node_modules/foo.js');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertGlobMatch(p, 'node_modules/some/folder/foo.js');
        assertGlobMatch(p, '/node_modules/some/folder/foo.js');
        assertNoGlobMatch(p, 'node_modules/some/folder/foo.ts');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        p = '{**/node_modules/**,**/.git/**,**/bower_components/**}';
        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, '/node_modules');
        assertGlobMatch(p, '/node_modules/more');
        assertGlobMatch(p, 'some/test/node_modules');
        assertGlobMatch(p, 'some\\test\\node_modules');
        assertGlobMatch(p, '/some/test/node_modules');
        assertGlobMatch(p, '\\some\\test\\node_modules');
        assertGlobMatch(p, 'C:\\\\some\\test\\node_modules');
        assertGlobMatch(p, 'C:\\\\some\\test\\node_modules\\more');
        assertGlobMatch(p, 'bower_components');
        assertGlobMatch(p, 'bower_components/more');
        assertGlobMatch(p, '/bower_components');
        assertGlobMatch(p, 'some/test/bower_components');
        assertGlobMatch(p, 'some\\test\\bower_components');
        assertGlobMatch(p, '/some/test/bower_components');
        assertGlobMatch(p, '\\some\\test\\bower_components');
        assertGlobMatch(p, 'C:\\\\some\\test\\bower_components');
        assertGlobMatch(p, 'C:\\\\some\\test\\bower_components\\more');
        assertGlobMatch(p, '.git');
        assertGlobMatch(p, '/.git');
        assertGlobMatch(p, 'some/test/.git');
        assertGlobMatch(p, 'some\\test\\.git');
        assertGlobMatch(p, '/some/test/.git');
        assertGlobMatch(p, '\\some\\test\\.git');
        assertGlobMatch(p, 'C:\\\\some\\test\\.git');
        assertNoGlobMatch(p, 'tempting');
        assertNoGlobMatch(p, '/tempting');
        assertNoGlobMatch(p, 'some/test/tempting');
        assertNoGlobMatch(p, 'some\\test\\tempting');
        assertNoGlobMatch(p, '/some/test/tempting');
        assertNoGlobMatch(p, '\\some\\test\\tempting');
        assertNoGlobMatch(p, 'C:\\\\some\\test\\tempting');
        p = '{**/package.json,**/project.json}';
        assertGlobMatch(p, 'package.json');
        assertGlobMatch(p, '/package.json');
        assertNoGlobMatch(p, 'xpackage.json');
        assertNoGlobMatch(p, '/xpackage.json');
    });
    test('issue 41724', function () {
        let p = 'some/**/*.js';
        assertGlobMatch(p, 'some/foo.js');
        assertGlobMatch(p, 'some/folder/foo.js');
        assertNoGlobMatch(p, 'something/foo.js');
        assertNoGlobMatch(p, 'something/folder/foo.js');
        p = 'some/**/*';
        assertGlobMatch(p, 'some/foo.js');
        assertGlobMatch(p, 'some/folder/foo.js');
        assertNoGlobMatch(p, 'something/foo.js');
        assertNoGlobMatch(p, 'something/folder/foo.js');
    });
    test('brace expansion', function () {
        let p = '*.{html,js}';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'foo.html');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        p = '*.{html}';
        assertGlobMatch(p, 'foo.html');
        assertNoGlobMatch(p, 'foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        p = '{node_modules,testing}';
        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, 'testing');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, 'dtesting');
        p = '**/{foo,bar}';
        assertGlobMatch(p, 'foo');
        assertGlobMatch(p, 'bar');
        assertGlobMatch(p, 'test/foo');
        assertGlobMatch(p, 'test/bar');
        assertGlobMatch(p, 'other/more/foo');
        assertGlobMatch(p, 'other/more/bar');
        assertGlobMatch(p, '/foo');
        assertGlobMatch(p, '/bar');
        assertGlobMatch(p, '/test/foo');
        assertGlobMatch(p, '/test/bar');
        assertGlobMatch(p, '/other/more/foo');
        assertGlobMatch(p, '/other/more/bar');
        p = '{foo,bar}/**';
        assertGlobMatch(p, 'foo');
        assertGlobMatch(p, 'bar');
        assertGlobMatch(p, 'bar/');
        assertGlobMatch(p, 'foo/test');
        assertGlobMatch(p, 'bar/test');
        assertGlobMatch(p, 'bar/test/');
        assertGlobMatch(p, 'foo/other/more');
        assertGlobMatch(p, 'bar/other/more');
        assertGlobMatch(p, 'bar/other/more/');
        p = '{**/*.d.ts,**/*.js}';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing\\foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, '\\testing\\foo.js');
        assertGlobMatch(p, 'C:\\testing\\foo.js');
        assertGlobMatch(p, 'foo.d.ts');
        assertGlobMatch(p, 'testing/foo.d.ts');
        assertGlobMatch(p, 'testing\\foo.d.ts');
        assertGlobMatch(p, '/testing/foo.d.ts');
        assertGlobMatch(p, '\\testing\\foo.d.ts');
        assertGlobMatch(p, 'C:\\testing\\foo.d.ts');
        assertNoGlobMatch(p, 'foo.d');
        assertNoGlobMatch(p, 'testing/foo.d');
        assertNoGlobMatch(p, 'testing\\foo.d');
        assertNoGlobMatch(p, '/testing/foo.d');
        assertNoGlobMatch(p, '\\testing\\foo.d');
        assertNoGlobMatch(p, 'C:\\testing\\foo.d');
        p = '{**/*.d.ts,**/*.js,path/simple.jgs}';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing\\foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, 'path/simple.jgs');
        assertNoGlobMatch(p, '/path/simple.jgs');
        assertGlobMatch(p, '\\testing\\foo.js');
        assertGlobMatch(p, 'C:\\testing\\foo.js');
        p = '{**/*.d.ts,**/*.js,foo.[0-9]}';
        assertGlobMatch(p, 'foo.5');
        assertGlobMatch(p, 'foo.8');
        assertNoGlobMatch(p, 'bar.5');
        assertNoGlobMatch(p, 'foo.f');
        assertGlobMatch(p, 'foo.js');
        p = 'prefix/{**/*.d.ts,**/*.js,foo.[0-9]}';
        assertGlobMatch(p, 'prefix/foo.5');
        assertGlobMatch(p, 'prefix/foo.8');
        assertNoGlobMatch(p, 'prefix/bar.5');
        assertNoGlobMatch(p, 'prefix/foo.f');
        assertGlobMatch(p, 'prefix/foo.js');
    });
    test('expression support (single)', function () {
        const siblings = ['test.html', 'test.txt', 'test.ts', 'test.js'];
        const hasSibling = (name) => siblings.indexOf(name) !== -1;
        // { "**/*.js": { "when": "$(basename).ts" } }
        let expression = {
            '**/*.js': {
                when: '$(basename).ts'
            }
        };
        assert.strictEqual('**/*.js', glob.parse(expression)('test.js', undefined, hasSibling));
        assert.strictEqual(glob.parse(expression)('test.js', undefined, () => false), null);
        assert.strictEqual(glob.parse(expression)('test.js', undefined, name => name === 'te.ts'), null);
        assert.strictEqual(glob.parse(expression)('test.js', undefined), null);
        expression = {
            '**/*.js': {
                when: ''
            }
        };
        assert.strictEqual(glob.parse(expression)('test.js', undefined, hasSibling), null);
        expression = {
            // eslint-disable-next-line local/code-no-any-casts
            '**/*.js': {}
        };
        assert.strictEqual('**/*.js', glob.parse(expression)('test.js', undefined, hasSibling));
        expression = {};
        assert.strictEqual(glob.parse(expression)('test.js', undefined, hasSibling), null);
    });
    test('expression support (multiple)', function () {
        const siblings = ['test.html', 'test.txt', 'test.ts', 'test.js'];
        const hasSibling = (name) => siblings.indexOf(name) !== -1;
        // { "**/*.js": { "when": "$(basename).ts" } }
        const expression = {
            '**/*.js': { when: '$(basename).ts' },
            '**/*.as': true,
            '**/*.foo': false,
            // eslint-disable-next-line local/code-no-any-casts
            '**/*.bananas': { bananas: true }
        };
        assert.strictEqual('**/*.js', glob.parse(expression)('test.js', undefined, hasSibling));
        assert.strictEqual('**/*.as', glob.parse(expression)('test.as', undefined, hasSibling));
        assert.strictEqual('**/*.bananas', glob.parse(expression)('test.bananas', undefined, hasSibling));
        assert.strictEqual('**/*.bananas', glob.parse(expression)('test.bananas', undefined));
        assert.strictEqual(glob.parse(expression)('test.foo', undefined, hasSibling), null);
    });
    test('brackets', () => {
        let p = 'foo.[0-9]';
        assertGlobMatch(p, 'foo.5');
        assertGlobMatch(p, 'foo.8');
        assertNoGlobMatch(p, 'bar.5');
        assertNoGlobMatch(p, 'foo.f');
        p = 'foo.[^0-9]';
        assertNoGlobMatch(p, 'foo.5');
        assertNoGlobMatch(p, 'foo.8');
        assertNoGlobMatch(p, 'bar.5');
        assertGlobMatch(p, 'foo.f');
        p = 'foo.[!0-9]';
        assertNoGlobMatch(p, 'foo.5');
        assertNoGlobMatch(p, 'foo.8');
        assertNoGlobMatch(p, 'bar.5');
        assertGlobMatch(p, 'foo.f');
        p = 'foo.[0!^*?]';
        assertNoGlobMatch(p, 'foo.5');
        assertNoGlobMatch(p, 'foo.8');
        assertGlobMatch(p, 'foo.0');
        assertGlobMatch(p, 'foo.!');
        assertGlobMatch(p, 'foo.^');
        assertGlobMatch(p, 'foo.*');
        assertGlobMatch(p, 'foo.?');
        p = 'foo[/]bar';
        assertNoGlobMatch(p, 'foo/bar');
        p = 'foo.[[]';
        assertGlobMatch(p, 'foo.[');
        p = 'foo.[]]';
        assertGlobMatch(p, 'foo.]');
        p = 'foo.[][!]';
        assertGlobMatch(p, 'foo.]');
        assertGlobMatch(p, 'foo.[');
        assertGlobMatch(p, 'foo.!');
        p = 'foo.[]-]';
        assertGlobMatch(p, 'foo.]');
        assertGlobMatch(p, 'foo.-');
    });
    test('full path', function () {
        assertGlobMatch('testing/this/foo.txt', 'testing/this/foo.txt');
    });
    test('ending path', function () {
        assertGlobMatch('**/testing/this/foo.txt', 'some/path/testing/this/foo.txt');
    });
    test('prefix agnostic', function () {
        let p = '**/*.js';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, '/foo.js');
        assertGlobMatch(p, '\\foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing\\foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, '\\testing\\foo.js');
        assertGlobMatch(p, 'C:\\testing\\foo.js');
        assertNoGlobMatch(p, 'foo.ts');
        assertNoGlobMatch(p, 'testing/foo.ts');
        assertNoGlobMatch(p, 'testing\\foo.ts');
        assertNoGlobMatch(p, '/testing/foo.ts');
        assertNoGlobMatch(p, '\\testing\\foo.ts');
        assertNoGlobMatch(p, 'C:\\testing\\foo.ts');
        assertNoGlobMatch(p, 'foo.js.txt');
        assertNoGlobMatch(p, 'testing/foo.js.txt');
        assertNoGlobMatch(p, 'testing\\foo.js.txt');
        assertNoGlobMatch(p, '/testing/foo.js.txt');
        assertNoGlobMatch(p, '\\testing\\foo.js.txt');
        assertNoGlobMatch(p, 'C:\\testing\\foo.js.txt');
        assertNoGlobMatch(p, 'testing.js/foo');
        assertNoGlobMatch(p, 'testing.js\\foo');
        assertNoGlobMatch(p, '/testing.js/foo');
        assertNoGlobMatch(p, '\\testing.js\\foo');
        assertNoGlobMatch(p, 'C:\\testing.js\\foo');
        p = '**/foo.js';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, '/foo.js');
        assertGlobMatch(p, '\\foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing\\foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, '\\testing\\foo.js');
        assertGlobMatch(p, 'C:\\testing\\foo.js');
    });
    test('cached properly', function () {
        const p = '**/*.js';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing\\foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, '\\testing\\foo.js');
        assertGlobMatch(p, 'C:\\testing\\foo.js');
        assertNoGlobMatch(p, 'foo.ts');
        assertNoGlobMatch(p, 'testing/foo.ts');
        assertNoGlobMatch(p, 'testing\\foo.ts');
        assertNoGlobMatch(p, '/testing/foo.ts');
        assertNoGlobMatch(p, '\\testing\\foo.ts');
        assertNoGlobMatch(p, 'C:\\testing\\foo.ts');
        assertNoGlobMatch(p, 'foo.js.txt');
        assertNoGlobMatch(p, 'testing/foo.js.txt');
        assertNoGlobMatch(p, 'testing\\foo.js.txt');
        assertNoGlobMatch(p, '/testing/foo.js.txt');
        assertNoGlobMatch(p, '\\testing\\foo.js.txt');
        assertNoGlobMatch(p, 'C:\\testing\\foo.js.txt');
        assertNoGlobMatch(p, 'testing.js/foo');
        assertNoGlobMatch(p, 'testing.js\\foo');
        assertNoGlobMatch(p, '/testing.js/foo');
        assertNoGlobMatch(p, '\\testing.js\\foo');
        assertNoGlobMatch(p, 'C:\\testing.js\\foo');
        // Run again and make sure the regex are properly reused
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing\\foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, '\\testing\\foo.js');
        assertGlobMatch(p, 'C:\\testing\\foo.js');
        assertNoGlobMatch(p, 'foo.ts');
        assertNoGlobMatch(p, 'testing/foo.ts');
        assertNoGlobMatch(p, 'testing\\foo.ts');
        assertNoGlobMatch(p, '/testing/foo.ts');
        assertNoGlobMatch(p, '\\testing\\foo.ts');
        assertNoGlobMatch(p, 'C:\\testing\\foo.ts');
        assertNoGlobMatch(p, 'foo.js.txt');
        assertNoGlobMatch(p, 'testing/foo.js.txt');
        assertNoGlobMatch(p, 'testing\\foo.js.txt');
        assertNoGlobMatch(p, '/testing/foo.js.txt');
        assertNoGlobMatch(p, '\\testing\\foo.js.txt');
        assertNoGlobMatch(p, 'C:\\testing\\foo.js.txt');
        assertNoGlobMatch(p, 'testing.js/foo');
        assertNoGlobMatch(p, 'testing.js\\foo');
        assertNoGlobMatch(p, '/testing.js/foo');
        assertNoGlobMatch(p, '\\testing.js\\foo');
        assertNoGlobMatch(p, 'C:\\testing.js\\foo');
    });
    test('invalid glob', function () {
        const p = '**/*(.js';
        assertNoGlobMatch(p, 'foo.js');
    });
    test('split glob aware', function () {
        assert.deepStrictEqual(glob.splitGlobAware('foo,bar', ','), ['foo', 'bar']);
        assert.deepStrictEqual(glob.splitGlobAware('foo', ','), ['foo']);
        assert.deepStrictEqual(glob.splitGlobAware('{foo,bar}', ','), ['{foo,bar}']);
        assert.deepStrictEqual(glob.splitGlobAware('foo,bar,{foo,bar}', ','), ['foo', 'bar', '{foo,bar}']);
        assert.deepStrictEqual(glob.splitGlobAware('{foo,bar},foo,bar,{foo,bar}', ','), ['{foo,bar}', 'foo', 'bar', '{foo,bar}']);
        assert.deepStrictEqual(glob.splitGlobAware('[foo,bar]', ','), ['[foo,bar]']);
        assert.deepStrictEqual(glob.splitGlobAware('foo,bar,[foo,bar]', ','), ['foo', 'bar', '[foo,bar]']);
        assert.deepStrictEqual(glob.splitGlobAware('[foo,bar],foo,bar,[foo,bar]', ','), ['[foo,bar]', 'foo', 'bar', '[foo,bar]']);
    });
    test('expression with disabled glob', function () {
        const expr = { '**/*.js': false };
        assert.strictEqual(glob.match(expr, 'foo.js'), null);
    });
    test('expression with two non-trivia globs', function () {
        const expr = {
            '**/*.j?': true,
            '**/*.t?': true
        };
        assert.strictEqual(glob.match(expr, 'foo.js'), '**/*.j?');
        assert.strictEqual(glob.match(expr, 'foo.as'), null);
    });
    test('expression with non-trivia glob (issue 144458)', function () {
        const pattern = '**/p*';
        assert.strictEqual(glob.match(pattern, 'foo/barp'), false);
        assert.strictEqual(glob.match(pattern, 'foo/bar/ap'), false);
        assert.strictEqual(glob.match(pattern, 'ap'), false);
        assert.strictEqual(glob.match(pattern, 'foo/barp1'), false);
        assert.strictEqual(glob.match(pattern, 'foo/bar/ap1'), false);
        assert.strictEqual(glob.match(pattern, 'ap1'), false);
        assert.strictEqual(glob.match(pattern, '/foo/barp'), false);
        assert.strictEqual(glob.match(pattern, '/foo/bar/ap'), false);
        assert.strictEqual(glob.match(pattern, '/ap'), false);
        assert.strictEqual(glob.match(pattern, '/foo/barp1'), false);
        assert.strictEqual(glob.match(pattern, '/foo/bar/ap1'), false);
        assert.strictEqual(glob.match(pattern, '/ap1'), false);
        assert.strictEqual(glob.match(pattern, 'foo/pbar'), true);
        assert.strictEqual(glob.match(pattern, '/foo/pbar'), true);
        assert.strictEqual(glob.match(pattern, 'foo/bar/pa'), true);
        assert.strictEqual(glob.match(pattern, '/p'), true);
    });
    test('expression with empty glob', function () {
        const expr = { '': true };
        assert.strictEqual(glob.match(expr, 'foo.js'), null);
    });
    test('expression with other falsy value', function () {
        // eslint-disable-next-line local/code-no-any-casts
        const expr = { '**/*.js': 0 };
        assert.strictEqual(glob.match(expr, 'foo.js'), '**/*.js');
    });
    test('expression with two basename globs', function () {
        const expr = {
            '**/bar': true,
            '**/baz': true
        };
        assert.strictEqual(glob.match(expr, 'bar'), '**/bar');
        assert.strictEqual(glob.match(expr, 'foo'), null);
        assert.strictEqual(glob.match(expr, 'foo/bar'), '**/bar');
        assert.strictEqual(glob.match(expr, 'foo\\bar'), '**/bar');
        assert.strictEqual(glob.match(expr, 'foo/foo'), null);
    });
    test('expression with two basename globs and a siblings expression', function () {
        const expr = {
            '**/bar': true,
            '**/baz': true,
            '**/*.js': { when: '$(basename).ts' }
        };
        const siblings = ['foo.ts', 'foo.js', 'foo', 'bar'];
        const hasSibling = (name) => siblings.indexOf(name) !== -1;
        assert.strictEqual(glob.parse(expr)('bar', undefined, hasSibling), '**/bar');
        assert.strictEqual(glob.parse(expr)('foo', undefined, hasSibling), null);
        assert.strictEqual(glob.parse(expr)('foo/bar', undefined, hasSibling), '**/bar');
        if (isWindows) {
            // backslash is a valid file name character on posix
            assert.strictEqual(glob.parse(expr)('foo\\bar', undefined, hasSibling), '**/bar');
        }
        assert.strictEqual(glob.parse(expr)('foo/foo', undefined, hasSibling), null);
        assert.strictEqual(glob.parse(expr)('foo.js', undefined, hasSibling), '**/*.js');
        assert.strictEqual(glob.parse(expr)('bar.js', undefined, hasSibling), null);
    });
    test('expression with multipe basename globs', function () {
        const expr = {
            '**/bar': true,
            '{**/baz,**/foo}': true
        };
        assert.strictEqual(glob.match(expr, 'bar'), '**/bar');
        assert.strictEqual(glob.match(expr, 'foo'), '{**/baz,**/foo}');
        assert.strictEqual(glob.match(expr, 'baz'), '{**/baz,**/foo}');
        assert.strictEqual(glob.match(expr, 'abc'), null);
    });
    test('falsy expression/pattern', function () {
        assert.strictEqual(glob.match(null, 'foo'), false);
        assert.strictEqual(glob.match('', 'foo'), false);
        assert.strictEqual(glob.parse(null)('foo'), false);
        assert.strictEqual(glob.parse('')('foo'), false);
    });
    test('falsy path', function () {
        assert.strictEqual(glob.parse('foo')(null), false);
        assert.strictEqual(glob.parse('foo')(''), false);
        assert.strictEqual(glob.parse('**/*.j?')(null), false);
        assert.strictEqual(glob.parse('**/*.j?')(''), false);
        assert.strictEqual(glob.parse('**/*.foo')(null), false);
        assert.strictEqual(glob.parse('**/*.foo')(''), false);
        assert.strictEqual(glob.parse('**/foo')(null), false);
        assert.strictEqual(glob.parse('**/foo')(''), false);
        assert.strictEqual(glob.parse('{**/baz,**/foo}')(null), false);
        assert.strictEqual(glob.parse('{**/baz,**/foo}')(''), false);
        assert.strictEqual(glob.parse('{**/*.baz,**/*.foo}')(null), false);
        assert.strictEqual(glob.parse('{**/*.baz,**/*.foo}')(''), false);
    });
    test('expression/pattern basename', function () {
        assert.strictEqual(glob.parse('**/foo')('bar/baz', 'baz'), false);
        assert.strictEqual(glob.parse('**/foo')('bar/foo', 'foo'), true);
        assert.strictEqual(glob.parse('{**/baz,**/foo}')('baz/bar', 'bar'), false);
        assert.strictEqual(glob.parse('{**/baz,**/foo}')('baz/foo', 'foo'), true);
        const expr = { '**/*.js': { when: '$(basename).ts' } };
        const siblings = ['foo.ts', 'foo.js'];
        const hasSibling = (name) => siblings.indexOf(name) !== -1;
        assert.strictEqual(glob.parse(expr)('bar/baz.js', 'baz.js', hasSibling), null);
        assert.strictEqual(glob.parse(expr)('bar/foo.js', 'foo.js', hasSibling), '**/*.js');
    });
    test('expression/pattern basename terms', function () {
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('**/*.foo')), []);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('**/foo')), ['foo']);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('**/foo/')), ['foo']);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('{**/baz,**/foo}')), ['baz', 'foo']);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('{**/baz/,**/foo/}')), ['baz', 'foo']);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse({
            '**/foo': true,
            '{**/bar,**/baz}': true,
            '{**/bar2/,**/baz2/}': true,
            '**/bulb': false
        })), ['foo', 'bar', 'baz', 'bar2', 'baz2']);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse({
            '**/foo': { when: '$(basename).zip' },
            '**/bar': true
        })), ['bar']);
    });
    test('expression/pattern optimization for basenames', function () {
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('**/foo/**')), []);
        assert.deepStrictEqual(glob.getBasenameTerms(glob.parse('**/foo/**', { trimForExclusions: true })), ['foo']);
        testOptimizationForBasenames('**/*.foo/**', [], [['baz/bar.foo/bar/baz', true]]);
        testOptimizationForBasenames('**/foo/**', ['foo'], [['bar/foo', true], ['bar/foo/baz', false]]);
        testOptimizationForBasenames('{**/baz/**,**/foo/**}', ['baz', 'foo'], [['bar/baz', true], ['bar/foo', true]]);
        testOptimizationForBasenames({
            '**/foo/**': true,
            '{**/bar/**,**/baz/**}': true,
            '**/bulb/**': false
        }, ['foo', 'bar', 'baz'], [
            ['bar/foo', '**/foo/**'],
            ['foo/bar', '{**/bar/**,**/baz/**}'],
            ['bar/nope', null]
        ]);
        const siblings = ['baz', 'baz.zip', 'nope'];
        const hasSibling = (name) => siblings.indexOf(name) !== -1;
        testOptimizationForBasenames({
            '**/foo/**': { when: '$(basename).zip' },
            '**/bar/**': true
        }, ['bar'], [
            ['bar/foo', null],
            ['bar/foo/baz', null],
            ['bar/foo/nope', null],
            ['foo/bar', '**/bar/**'],
        ], [
            null,
            hasSibling,
            hasSibling
        ]);
    });
    function testOptimizationForBasenames(pattern, basenameTerms, matches, siblingsFns = []) {
        const parsed = glob.parse(pattern, { trimForExclusions: true });
        assert.deepStrictEqual(glob.getBasenameTerms(parsed), basenameTerms);
        matches.forEach(([text, result], i) => {
            assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
        });
    }
    test('trailing slash', function () {
        // Testing existing (more or less intuitive) behavior
        assert.strictEqual(glob.parse('**/foo/')('bar/baz', 'baz'), false);
        assert.strictEqual(glob.parse('**/foo/')('bar/foo', 'foo'), true);
        assert.strictEqual(glob.parse('**/*.foo/')('bar/file.baz', 'file.baz'), false);
        assert.strictEqual(glob.parse('**/*.foo/')('bar/file.foo', 'file.foo'), true);
        assert.strictEqual(glob.parse('{**/foo/,**/abc/}')('bar/baz', 'baz'), false);
        assert.strictEqual(glob.parse('{**/foo/,**/abc/}')('bar/foo', 'foo'), true);
        assert.strictEqual(glob.parse('{**/foo/,**/abc/}')('bar/abc', 'abc'), true);
        assert.strictEqual(glob.parse('{**/foo/,**/abc/}', { trimForExclusions: true })('bar/baz', 'baz'), false);
        assert.strictEqual(glob.parse('{**/foo/,**/abc/}', { trimForExclusions: true })('bar/foo', 'foo'), true);
        assert.strictEqual(glob.parse('{**/foo/,**/abc/}', { trimForExclusions: true })('bar/abc', 'abc'), true);
    });
    test('expression/pattern path', function () {
        assert.strictEqual(glob.parse('**/foo/bar')(nativeSep('foo/baz'), 'baz'), false);
        assert.strictEqual(glob.parse('**/foo/bar')(nativeSep('foo/bar'), 'bar'), true);
        assert.strictEqual(glob.parse('**/foo/bar')(nativeSep('bar/foo/bar'), 'bar'), true);
        assert.strictEqual(glob.parse('**/foo/bar/**')(nativeSep('bar/foo/bar'), 'bar'), true);
        assert.strictEqual(glob.parse('**/foo/bar/**')(nativeSep('bar/foo/bar/baz'), 'baz'), true);
        assert.strictEqual(glob.parse('**/foo/bar/**', { trimForExclusions: true })(nativeSep('bar/foo/bar'), 'bar'), true);
        assert.strictEqual(glob.parse('**/foo/bar/**', { trimForExclusions: true })(nativeSep('bar/foo/bar/baz'), 'baz'), false);
        assert.strictEqual(glob.parse('foo/bar')(nativeSep('foo/baz'), 'baz'), false);
        assert.strictEqual(glob.parse('foo/bar')(nativeSep('foo/bar'), 'bar'), true);
        assert.strictEqual(glob.parse('foo/bar/baz')(nativeSep('foo/bar/baz'), 'baz'), true); // #15424
        assert.strictEqual(glob.parse('foo/bar')(nativeSep('bar/foo/bar'), 'bar'), false);
        assert.strictEqual(glob.parse('foo/bar/**')(nativeSep('foo/bar/baz'), 'baz'), true);
        assert.strictEqual(glob.parse('foo/bar/**', { trimForExclusions: true })(nativeSep('foo/bar'), 'bar'), true);
        assert.strictEqual(glob.parse('foo/bar/**', { trimForExclusions: true })(nativeSep('foo/bar/baz'), 'baz'), false);
    });
    test('expression/pattern paths', function () {
        assert.deepStrictEqual(glob.getPathTerms(glob.parse('**/*.foo')), []);
        assert.deepStrictEqual(glob.getPathTerms(glob.parse('**/foo')), []);
        assert.deepStrictEqual(glob.getPathTerms(glob.parse('**/foo/bar')), ['*/foo/bar']);
        assert.deepStrictEqual(glob.getPathTerms(glob.parse('**/foo/bar/')), ['*/foo/bar']);
        // Not supported
        // assert.deepStrictEqual(glob.getPathTerms(glob.parse('{**/baz/bar,**/foo/bar,**/bar}')), ['*/baz/bar', '*/foo/bar']);
        // assert.deepStrictEqual(glob.getPathTerms(glob.parse('{**/baz/bar/,**/foo/bar/,**/bar/}')), ['*/baz/bar', '*/foo/bar']);
        const parsed = glob.parse({
            '**/foo/bar': true,
            '**/foo2/bar2': true,
            // Not supported
            // '{**/bar/foo,**/baz/foo}': true,
            // '{**/bar2/foo/,**/baz2/foo/}': true,
            '**/bulb': true,
            '**/bulb2': true,
            '**/bulb/foo': false
        });
        assert.deepStrictEqual(glob.getPathTerms(parsed), ['*/foo/bar', '*/foo2/bar2']);
        assert.deepStrictEqual(glob.getBasenameTerms(parsed), ['bulb', 'bulb2']);
        assert.deepStrictEqual(glob.getPathTerms(glob.parse({
            '**/foo/bar': { when: '$(basename).zip' },
            '**/bar/foo': true,
            '**/bar2/foo2': true
        })), ['*/bar/foo', '*/bar2/foo2']);
    });
    test('expression/pattern optimization for paths', function () {
        assert.deepStrictEqual(glob.getPathTerms(glob.parse('**/foo/bar/**')), []);
        assert.deepStrictEqual(glob.getPathTerms(glob.parse('**/foo/bar/**', { trimForExclusions: true })), ['*/foo/bar']);
        testOptimizationForPaths('**/*.foo/bar/**', [], [[nativeSep('baz/bar.foo/bar/baz'), true]]);
        testOptimizationForPaths('**/foo/bar/**', ['*/foo/bar'], [[nativeSep('bar/foo/bar'), true], [nativeSep('bar/foo/bar/baz'), false]]);
        // Not supported
        // testOptimizationForPaths('{**/baz/bar/**,**/foo/bar/**}', ['*/baz/bar', '*/foo/bar'], [[nativeSep('bar/baz/bar'), true], [nativeSep('bar/foo/bar'), true]]);
        testOptimizationForPaths({
            '**/foo/bar/**': true,
            // Not supported
            // '{**/bar/bar/**,**/baz/bar/**}': true,
            '**/bulb/bar/**': false
        }, ['*/foo/bar'], [
            [nativeSep('bar/foo/bar'), '**/foo/bar/**'],
            // Not supported
            // [nativeSep('foo/bar/bar'), '{**/bar/bar/**,**/baz/bar/**}'],
            [nativeSep('/foo/bar/nope'), null]
        ]);
        const siblings = ['baz', 'baz.zip', 'nope'];
        const hasSibling = (name) => siblings.indexOf(name) !== -1;
        testOptimizationForPaths({
            '**/foo/123/**': { when: '$(basename).zip' },
            '**/bar/123/**': true
        }, ['*/bar/123'], [
            [nativeSep('bar/foo/123'), null],
            [nativeSep('bar/foo/123/baz'), null],
            [nativeSep('bar/foo/123/nope'), null],
            [nativeSep('foo/bar/123'), '**/bar/123/**'],
        ], [
            null,
            hasSibling,
            hasSibling
        ]);
    });
    function testOptimizationForPaths(pattern, pathTerms, matches, siblingsFns = []) {
        const parsed = glob.parse(pattern, { trimForExclusions: true });
        assert.deepStrictEqual(glob.getPathTerms(parsed), pathTerms);
        matches.forEach(([text, result], i) => {
            assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
        });
    }
    function nativeSep(slashPath) {
        return slashPath.replace(/\//g, sep);
    }
    test('relative pattern - glob star', function () {
        if (isWindows) {
            const p = { base: 'C:\\DNXConsoleApp\\foo', pattern: '**/*.cs' };
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.cs');
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\bar\\Program.cs');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.ts');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\Program.cs');
            assertNoGlobMatch(p, 'C:\\other\\DNXConsoleApp\\foo\\Program.ts');
        }
        else {
            const p = { base: '/DNXConsoleApp/foo', pattern: '**/*.cs' };
            assertGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');
            assertGlobMatch(p, '/DNXConsoleApp/foo/bar/Program.cs');
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/Program.ts');
            assertNoGlobMatch(p, '/DNXConsoleApp/Program.cs');
            assertNoGlobMatch(p, '/other/DNXConsoleApp/foo/Program.ts');
        }
    });
    test('relative pattern - single star', function () {
        if (isWindows) {
            const p = { base: 'C:\\DNXConsoleApp\\foo', pattern: '*.cs' };
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.cs');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\bar\\Program.cs');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.ts');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\Program.cs');
            assertNoGlobMatch(p, 'C:\\other\\DNXConsoleApp\\foo\\Program.ts');
        }
        else {
            const p = { base: '/DNXConsoleApp/foo', pattern: '*.cs' };
            assertGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/bar/Program.cs');
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/Program.ts');
            assertNoGlobMatch(p, '/DNXConsoleApp/Program.cs');
            assertNoGlobMatch(p, '/other/DNXConsoleApp/foo/Program.ts');
        }
    });
    test('relative pattern - single star with path', function () {
        if (isWindows) {
            const p = { base: 'C:\\DNXConsoleApp\\foo', pattern: 'something/*.cs' };
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\something\\Program.cs');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.cs');
        }
        else {
            const p = { base: '/DNXConsoleApp/foo', pattern: 'something/*.cs' };
            assertGlobMatch(p, '/DNXConsoleApp/foo/something/Program.cs');
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');
        }
    });
    test('relative pattern - single star alone', function () {
        if (isWindows) {
            const p = { base: 'C:\\DNXConsoleApp\\foo\\something\\Program.cs', pattern: '*' };
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\something\\Program.cs');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.cs');
        }
        else {
            const p = { base: '/DNXConsoleApp/foo/something/Program.cs', pattern: '*' };
            assertGlobMatch(p, '/DNXConsoleApp/foo/something/Program.cs');
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');
        }
    });
    test('relative pattern - ignores case on macOS/Windows', function () {
        if (isWindows) {
            const p = { base: 'C:\\DNXConsoleApp\\foo', pattern: 'something/*.cs' };
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\something\\Program.cs'.toLowerCase());
        }
        else if (isMacintosh) {
            const p = { base: '/DNXConsoleApp/foo', pattern: 'something/*.cs' };
            assertGlobMatch(p, '/DNXConsoleApp/foo/something/Program.cs'.toLowerCase());
        }
        else if (isLinux) {
            const p = { base: '/DNXConsoleApp/foo', pattern: 'something/*.cs' };
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/something/Program.cs'.toLowerCase());
        }
    });
    test('relative pattern - trailing slash / backslash (#162498)', function () {
        if (isWindows) {
            let p = { base: 'C:\\', pattern: 'foo.cs' };
            assertGlobMatch(p, 'C:\\foo.cs');
            p = { base: 'C:\\bar\\', pattern: 'foo.cs' };
            assertGlobMatch(p, 'C:\\bar\\foo.cs');
        }
        else {
            let p = { base: '/', pattern: 'foo.cs' };
            assertGlobMatch(p, '/foo.cs');
            p = { base: '/bar/', pattern: 'foo.cs' };
            assertGlobMatch(p, '/bar/foo.cs');
        }
    });
    test('pattern with "base" does not explode - #36081', function () {
        assert.ok(glob.match({ 'base': true }, 'base'));
    });
    test('relative pattern - #57475', function () {
        if (isWindows) {
            const p = { base: 'C:\\DNXConsoleApp\\foo', pattern: 'styles/style.css' };
            assertGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\styles\\style.css');
            assertNoGlobMatch(p, 'C:\\DNXConsoleApp\\foo\\Program.cs');
        }
        else {
            const p = { base: '/DNXConsoleApp/foo', pattern: 'styles/style.css' };
            assertGlobMatch(p, '/DNXConsoleApp/foo/styles/style.css');
            assertNoGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');
        }
    });
    test('URI match', () => {
        const p = 'scheme:/**/*.md';
        assertGlobMatch(p, URI.file('super/duper/long/some/file.md').with({ scheme: 'scheme' }).toString());
    });
    test('expression fails when siblings use promises (https://github.com/microsoft/vscode/issues/146294)', async function () {
        const siblings = ['test.html', 'test.txt', 'test.ts'];
        const hasSibling = (name) => Promise.resolve(siblings.indexOf(name) !== -1);
        // { "**/*.js": { "when": "$(basename).ts" } }
        const expression = {
            '**/test.js': { when: '$(basename).js' },
            '**/*.js': { when: '$(basename).ts' }
        };
        const parsedExpression = glob.parse(expression);
        assert.strictEqual('**/*.js', await parsedExpression('test.js', undefined, hasSibling));
    });
    test('patternsEquals', () => {
        assert.ok(glob.patternsEquals(['a'], ['a']));
        assert.ok(!glob.patternsEquals(['a'], ['b']));
        assert.ok(glob.patternsEquals(['a', 'b', 'c'], ['a', 'b', 'c']));
        assert.ok(!glob.patternsEquals(['1', '2'], ['1', '3']));
        assert.ok(glob.patternsEquals([{ base: 'a', pattern: '*' }, 'b', 'c'], [{ base: 'a', pattern: '*' }, 'b', 'c']));
        assert.ok(glob.patternsEquals(undefined, undefined));
        assert.ok(!glob.patternsEquals(undefined, ['b']));
        assert.ok(!glob.patternsEquals(['a'], undefined));
    });
    test('isEmptyPattern', () => {
        assert.ok(glob.isEmptyPattern(glob.parse('')));
        assert.ok(glob.isEmptyPattern(glob.parse(undefined)));
        assert.ok(glob.isEmptyPattern(glob.parse(null)));
        assert.ok(glob.isEmptyPattern(glob.parse({})));
        assert.ok(glob.isEmptyPattern(glob.parse({ '': true })));
        assert.ok(glob.isEmptyPattern(glob.parse({ '**/*.js': false })));
    });
    test('caseInsensitiveMatch', () => {
        assertNoGlobMatch('PATH/FOO.js', 'path/foo.js');
        assertGlobMatch('PATH/FOO.js', 'path/foo.js', true);
        // T1
        assertNoGlobMatch('**/*.JS', 'bar/foo.js');
        assertGlobMatch('**/*.JS', 'bar/foo.js', true);
        // T2
        assertNoGlobMatch('**/package', 'bar/Package');
        assertGlobMatch('**/package', 'bar/Package', true);
        // T3
        assertNoGlobMatch('{**/*.JS,**/*.TS}', 'bar/foo.ts');
        assertNoGlobMatch('{**/*.JS,**/*.TS}', 'bar/foo.js');
        assertGlobMatch('{**/*.JS,**/*.TS}', 'bar/foo.ts', true);
        assertGlobMatch('{**/*.JS,**/*.TS}', 'bar/foo.js', true);
        // T4
        assertNoGlobMatch('**/FOO/Bar', 'bar/foo/bar');
        assertGlobMatch('**/FOO/Bar', 'bar/foo/bar', true);
        // T5
        assertNoGlobMatch('FOO/Bar', 'foo/bar');
        assertGlobMatch('FOO/Bar', 'foo/bar', true);
        // Other
        assertNoGlobMatch('some/*/Random/*/Path.FILE', 'some/very/random/unusual/path.file');
        assertGlobMatch('some/*/Random/*/Path.FILE', 'some/very/random/unusual/path.file', true);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xvYi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9nbG9iLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxJQUFJLE1BQU0sc0JBQXNCLENBQUM7QUFDN0MsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzNFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMxQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7SUFFbEIsdUJBQXVCO0lBRXZCLG9CQUFvQjtJQUNwQixnREFBZ0Q7SUFDaEQsc0NBQXNDO0lBQ3RDLHNFQUFzRTtJQUN0RSxlQUFlO0lBQ2YsMEJBQTBCO0lBQzFCLGdDQUFnQztJQUNoQyxvREFBb0Q7SUFDcEQscURBQXFEO0lBQ3JELDBCQUEwQjtJQUMxQixrQkFBa0I7SUFDbEIsa0JBQWtCO0lBQ2xCLGtCQUFrQjtJQUNsQixrQkFBa0I7SUFDbEIsaUJBQWlCO0lBQ2pCLGlCQUFpQjtJQUNqQixpQkFBaUI7SUFDakIsNEJBQTRCO0lBQzVCLGlDQUFpQztJQUNqQyxpQkFBaUI7SUFDakIsaUJBQWlCO0lBQ2pCLGdCQUFnQjtJQUNoQixNQUFNO0lBRU4saUJBQWlCO0lBQ2pCLGlDQUFpQztJQUNqQywwQ0FBMEM7SUFDMUMsa0JBQWtCO0lBQ2xCLHFCQUFxQjtJQUNyQix5QkFBeUI7SUFDekIsbUJBQW1CO0lBQ25CLCtCQUErQjtJQUMvQixNQUFNO0lBRU4sb0JB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SyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNyRCxDQUFDLENB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SUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxZQUFZLEVBQUU7UUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxJQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRTtRQUNuQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxRSxNQUFNLElBQUksR0FBRyxFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDckYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUNBQW1DLEVBQUU7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDN0UsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxn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LEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxRyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMxRyxDQUFDLENBQUMsQ0FB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