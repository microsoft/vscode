/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as path from 'path';
import glob = require('vs/base/common/glob');

suite('Glob', () => {

	// test('perf', function () {

	// 	let patterns = [
	// 		'{**/*.cs,**/*.json,**/*.csproj,**/*.sln}',
	// 		'{**/*.cs,**/*.csproj,**/*.sln}',
	// 		'{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6}',
	// 		'**/*.go',
	// 		'{**/*.ps,**/*.ps1}',
	// 		'{**/*.c,**/*.cpp,**/*.h}',
	// 		'{**/*.fsx,**/*.fsi,**/*.fs,**/*.ml,**/*.mli}',
	// 		'{**/*.js,**/*.jsx,**/*.es6}',
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

	test('simple', function () {
		let p = 'node_modules';

		assert(glob.match(p, 'node_modules'));
		assert(!glob.match(p, 'node_module'));
		assert(!glob.match(p, '/node_modules'));
		assert(!glob.match(p, 'test/node_modules'));

		p = 'test.txt';
		assert(glob.match(p, 'test.txt'));
		assert(!glob.match(p, 'test?txt'));
		assert(!glob.match(p, '/text.txt'));
		assert(!glob.match(p, 'test/test.txt'));

		p = 'test(.txt';
		assert(glob.match(p, 'test(.txt'));
		assert(!glob.match(p, 'test?txt'));

		p = 'qunit';

		assert(glob.match(p, 'qunit'));
		assert(!glob.match(p, 'qunit.css'));
		assert(!glob.match(p, 'test/qunit'));

		// Absolute

		p = '/DNXConsoleApp/**/*.cs';
		assert(glob.match(p, '/DNXConsoleApp/Program.cs'));
		assert(glob.match(p, '/DNXConsoleApp/foo/Program.cs'));

		p = 'C:/DNXConsoleApp/**/*.cs';
		assert(glob.match(p, 'C:\\DNXConsoleApp\\Program.cs'));
		assert(glob.match(p, 'C:\\DNXConsoleApp\\foo\\Program.cs'));
	});

	test('dot hidden', function () {
		let p = '.*';

		assert(glob.match(p, '.git'));
		assert(glob.match(p, '.hidden.txt'));
		assert(!glob.match(p, 'git'));
		assert(!glob.match(p, 'hidden.txt'));
		assert(!glob.match(p, 'path/.git'));
		assert(!glob.match(p, 'path/.hidden.txt'));

		p = '**/.*';
		assert(glob.match(p, '.git'));
		assert(glob.match(p, '.hidden.txt'));
		assert(!glob.match(p, 'git'));
		assert(!glob.match(p, 'hidden.txt'));
		assert(glob.match(p, 'path/.git'));
		assert(glob.match(p, 'path/.hidden.txt'));
		assert(!glob.match(p, 'path/git'));
		assert(!glob.match(p, 'pat.h/hidden.txt'));

		p = '._*';

		assert(glob.match(p, '._git'));
		assert(glob.match(p, '._hidden.txt'));
		assert(!glob.match(p, 'git'));
		assert(!glob.match(p, 'hidden.txt'));
		assert(!glob.match(p, 'path/._git'));
		assert(!glob.match(p, 'path/._hidden.txt'));

		p = '**/._*';
		assert(glob.match(p, '._git'));
		assert(glob.match(p, '._hidden.txt'));
		assert(!glob.match(p, 'git'));
		assert(!glob.match(p, 'hidden._txt'));
		assert(glob.match(p, 'path/._git'));
		assert(glob.match(p, 'path/._hidden.txt'));
		assert(!glob.match(p, 'path/git'));
		assert(!glob.match(p, 'pat.h/hidden._txt'));
	});

	test('file pattern', function () {
		let p = '*.js';

		assert(glob.match(p, 'foo.js'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_modules/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));

		p = 'html.*';
		assert(glob.match(p, 'html.js'));
		assert(glob.match(p, 'html.txt'));
		assert(!glob.match(p, 'htm.txt'));

		p = '*.*';
		assert(glob.match(p, 'html.js'));
		assert(glob.match(p, 'html.txt'));
		assert(glob.match(p, 'htm.txt'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_modules/foo.js'));

		p = 'node_modules/test/*.js';
		assert(glob.match(p, 'node_modules/test/foo.js'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_module/test/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));
	});

	test('star', function () {
		let p = 'node*modules';

		assert(glob.match(p, 'node_modules'));
		assert(glob.match(p, 'node_super_modules'));
		assert(!glob.match(p, 'node_module'));
		assert(!glob.match(p, '/node_modules'));
		assert(!glob.match(p, 'test/node_modules'));

		p = '*';
		assert(glob.match(p, 'html.js'));
		assert(glob.match(p, 'html.txt'));
		assert(glob.match(p, 'htm.txt'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_modules/foo.js'));
	});

	test('questionmark', function () {
		let p = 'node?modules';

		assert(glob.match(p, 'node_modules'));
		assert(!glob.match(p, 'node_super_modules'));
		assert(!glob.match(p, 'node_module'));
		assert(!glob.match(p, '/node_modules'));
		assert(!glob.match(p, 'test/node_modules'));

		p = '?';
		assert(glob.match(p, 'h'));
		assert(!glob.match(p, 'html.txt'));
		assert(!glob.match(p, 'htm.txt'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_modules/foo.js'));
	});

	test('globstar', function () {
		let p = '**/*.js';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'folder/foo.js'));
		assert(glob.match(p, '/node_modules/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));
		assert(!glob.match(p, '/some.js/test'));
		assert(!glob.match(p, '\\some.js\\test'));

		p = '**/project.json';

		assert(glob.match(p, 'project.json'));
		assert(glob.match(p, '/project.json'));
		assert(glob.match(p, 'some/folder/project.json'));
		assert(!glob.match(p, 'some/folder/file_project.json'));
		assert(!glob.match(p, 'some/folder/fileproject.json'));
		// assert(!glob.match(p, '/rrproject.json')); TODO@ben this still fails if T1-3 are disabled
		assert(!glob.match(p, 'some/rrproject.json'));
		// assert(!glob.match(p, 'rrproject.json'));
		// assert(!glob.match(p, '\\rrproject.json'));
		assert(!glob.match(p, 'some\\rrproject.json'));

		p = 'test/**';
		assert(glob.match(p, 'test'));
		assert(glob.match(p, 'test/foo.js'));
		assert(glob.match(p, 'test/other/foo.js'));
		assert(!glob.match(p, 'est/other/foo.js'));

		p = '**';
		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'folder/foo.js'));
		assert(glob.match(p, '/node_modules/foo.js'));
		assert(glob.match(p, 'foo.jss'));
		assert(glob.match(p, 'some.js/test'));

		p = 'test/**/*.js';
		assert(glob.match(p, 'test/foo.js'));
		assert(glob.match(p, 'test/other/foo.js'));
		assert(glob.match(p, 'test/other/more/foo.js'));
		assert(!glob.match(p, 'test/foo.ts'));
		assert(!glob.match(p, 'test/other/foo.ts'));
		assert(!glob.match(p, 'test/other/more/foo.ts'));

		p = '**/**/*.js';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'folder/foo.js'));
		assert(glob.match(p, '/node_modules/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));

		p = '**/node_modules/**/*.js';

		assert(!glob.match(p, 'foo.js'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(glob.match(p, 'node_modules/foo.js'));
		assert(glob.match(p, 'node_modules/some/folder/foo.js'));
		assert(!glob.match(p, 'node_modules/some/folder/foo.ts'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));

		p = '{**/node_modules/**,**/.git/**,**/bower_components/**}';

		assert(glob.match(p, 'node_modules'));
		assert(glob.match(p, '/node_modules'));
		assert(glob.match(p, '/node_modules/more'));
		assert(glob.match(p, 'some/test/node_modules'));
		assert(glob.match(p, 'some\\test\\node_modules'));
		assert(glob.match(p, 'C:\\\\some\\test\\node_modules'));
		assert(glob.match(p, 'C:\\\\some\\test\\node_modules\\more'));

		assert(glob.match(p, 'bower_components'));
		assert(glob.match(p, 'bower_components/more'));
		assert(glob.match(p, '/bower_components'));
		assert(glob.match(p, 'some/test/bower_components'));
		assert(glob.match(p, 'some\\test\\bower_components'));
		assert(glob.match(p, 'C:\\\\some\\test\\bower_components'));
		assert(glob.match(p, 'C:\\\\some\\test\\bower_components\\more'));

		assert(glob.match(p, '.git'));
		assert(glob.match(p, '/.git'));
		assert(glob.match(p, 'some/test/.git'));
		assert(glob.match(p, 'some\\test\\.git'));
		assert(glob.match(p, 'C:\\\\some\\test\\.git'));

		assert(!glob.match(p, 'tempting'));
		assert(!glob.match(p, '/tempting'));
		assert(!glob.match(p, 'some/test/tempting'));
		assert(!glob.match(p, 'some\\test\\tempting'));
		assert(!glob.match(p, 'C:\\\\some\\test\\tempting'));

		p = '{**/package.json,**/project.json}';
		assert(glob.match(p, 'package.json'));
		assert(glob.match(p, '/package.json'));
		assert(!glob.match(p, 'xpackage.json'));
		assert(!glob.match(p, '/xpackage.json'));
	});

	test('brace expansion', function () {
		let p = '*.{html,js}';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'foo.html'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_modules/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));

		p = '*.{html}';

		assert(glob.match(p, 'foo.html'));
		assert(!glob.match(p, 'foo.js'));
		assert(!glob.match(p, 'folder/foo.js'));
		assert(!glob.match(p, '/node_modules/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));

		p = '{node_modules,testing}';
		assert(glob.match(p, 'node_modules'));
		assert(glob.match(p, 'testing'));
		assert(!glob.match(p, 'node_module'));
		assert(!glob.match(p, 'dtesting'));

		p = '**/{foo,bar}';
		assert(glob.match(p, 'foo'));
		assert(glob.match(p, 'bar'));
		assert(glob.match(p, 'test/foo'));
		assert(glob.match(p, 'test/bar'));
		assert(glob.match(p, 'other/more/foo'));
		assert(glob.match(p, 'other/more/bar'));

		p = '{foo,bar}/**';
		assert(glob.match(p, 'foo'));
		assert(glob.match(p, 'bar'));
		assert(glob.match(p, 'foo/test'));
		assert(glob.match(p, 'bar/test'));
		assert(glob.match(p, 'foo/other/more'));
		assert(glob.match(p, 'bar/other/more'));

		p = '{**/*.d.ts,**/*.js}';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'testing/foo.js'));
		assert(glob.match(p, 'testing\\foo.js'));
		assert(glob.match(p, '/testing/foo.js'));
		assert(glob.match(p, '\\testing\\foo.js'));
		assert(glob.match(p, 'C:\\testing\\foo.js'));

		assert(glob.match(p, 'foo.d.ts'));
		assert(glob.match(p, 'testing/foo.d.ts'));
		assert(glob.match(p, 'testing\\foo.d.ts'));
		assert(glob.match(p, '/testing/foo.d.ts'));
		assert(glob.match(p, '\\testing\\foo.d.ts'));
		assert(glob.match(p, 'C:\\testing\\foo.d.ts'));

		assert(!glob.match(p, 'foo.d'));
		assert(!glob.match(p, 'testing/foo.d'));
		assert(!glob.match(p, 'testing\\foo.d'));
		assert(!glob.match(p, '/testing/foo.d'));
		assert(!glob.match(p, '\\testing\\foo.d'));
		assert(!glob.match(p, 'C:\\testing\\foo.d'));

		p = '{**/*.d.ts,**/*.js,path/simple.jgs}';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'testing/foo.js'));
		assert(glob.match(p, 'testing\\foo.js'));
		assert(glob.match(p, '/testing/foo.js'));
		assert(glob.match(p, 'path/simple.jgs'));
		assert(!glob.match(p, '/path/simple.jgs'));
		assert(glob.match(p, '\\testing\\foo.js'));
		assert(glob.match(p, 'C:\\testing\\foo.js'));

		p = '{**/*.d.ts,**/*.js,foo.[0-9]}';

		assert(glob.match(p, 'foo.5'));
		assert(glob.match(p, 'foo.8'));
		assert(!glob.match(p, 'bar.5'));
		assert(!glob.match(p, 'foo.f'));
		assert(glob.match(p, 'foo.js'));

		p = 'prefix/{**/*.d.ts,**/*.js,foo.[0-9]}';

		assert(glob.match(p, 'prefix/foo.5'));
		assert(glob.match(p, 'prefix/foo.8'));
		assert(!glob.match(p, 'prefix/bar.5'));
		assert(!glob.match(p, 'prefix/foo.f'));
		assert(glob.match(p, 'prefix/foo.js'));
	});

	test('expression support (single)', function () {
		let siblings = ['test.html', 'test.txt', 'test.ts', 'test.js'];

		// { "**/*.js": { "when": "$(basename).ts" } }
		let expression: glob.IExpression = {
			'**/*.js': {
				when: '$(basename).ts'
			}
		};

		assert.strictEqual('**/*.js', glob.match(expression, 'test.js', () => siblings));
		assert.strictEqual(glob.match(expression, 'test.js', () => []), null);
		assert.strictEqual(glob.match(expression, 'test.js', () => ['te.ts']), null);
		assert.strictEqual(glob.match(expression, 'test.js'), null);

		expression = {
			'**/*.js': {
				when: ''
			}
		};

		assert.strictEqual(glob.match(expression, 'test.js', () => siblings), null);

		expression = <any>{
			'**/*.js': {
			}
		};

		assert.strictEqual('**/*.js', glob.match(expression, 'test.js', () => siblings));

		expression = {};

		assert.strictEqual(glob.match(expression, 'test.js', () => siblings), null);
	});

	test('expression support (multiple)', function () {
		let siblings = ['test.html', 'test.txt', 'test.ts', 'test.js'];

		// { "**/*.js": { "when": "$(basename).ts" } }
		let expression: glob.IExpression = {
			'**/*.js': { when: '$(basename).ts' },
			'**/*.as': true,
			'**/*.foo': false,
			'**/*.bananas': { bananas: true }
		};

		assert.strictEqual('**/*.js', glob.match(expression, 'test.js', () => siblings));
		assert.strictEqual('**/*.as', glob.match(expression, 'test.as', () => siblings));
		assert.strictEqual('**/*.bananas', glob.match(expression, 'test.bananas', () => siblings));
		assert.strictEqual('**/*.bananas', glob.match(expression, 'test.bananas'));
		assert.strictEqual(glob.match(expression, 'test.foo', () => siblings), null);
	});

	test('brackets', function () {
		let p = 'foo.[0-9]';

		assert(glob.match(p, 'foo.5'));
		assert(glob.match(p, 'foo.8'));
		assert(!glob.match(p, 'bar.5'));
		assert(!glob.match(p, 'foo.f'));

		p = 'foo.[^0-9]';

		assert(!glob.match(p, 'foo.5'));
		assert(!glob.match(p, 'foo.8'));
		assert(!glob.match(p, 'bar.5'));
		assert(glob.match(p, 'foo.f'));
	});

	test('full path', function () {
		let p = 'testing/this/foo.txt';

		assert(glob.match(p, nativeSep('testing/this/foo.txt')));
	});

	test('prefix agnostic', function () {
		let p = '**/*.js';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, '/foo.js'));
		assert(glob.match(p, '\\foo.js'));
		assert(glob.match(p, 'testing/foo.js'));
		assert(glob.match(p, 'testing\\foo.js'));
		assert(glob.match(p, '/testing/foo.js'));
		assert(glob.match(p, '\\testing\\foo.js'));
		assert(glob.match(p, 'C:\\testing\\foo.js'));

		assert(!glob.match(p, 'foo.ts'));
		assert(!glob.match(p, 'testing/foo.ts'));
		assert(!glob.match(p, 'testing\\foo.ts'));
		assert(!glob.match(p, '/testing/foo.ts'));
		assert(!glob.match(p, '\\testing\\foo.ts'));
		assert(!glob.match(p, 'C:\\testing\\foo.ts'));

		assert(!glob.match(p, 'foo.js.txt'));
		assert(!glob.match(p, 'testing/foo.js.txt'));
		assert(!glob.match(p, 'testing\\foo.js.txt'));
		assert(!glob.match(p, '/testing/foo.js.txt'));
		assert(!glob.match(p, '\\testing\\foo.js.txt'));
		assert(!glob.match(p, 'C:\\testing\\foo.js.txt'));

		assert(!glob.match(p, 'testing.js/foo'));
		assert(!glob.match(p, 'testing.js\\foo'));
		assert(!glob.match(p, '/testing.js/foo'));
		assert(!glob.match(p, '\\testing.js\\foo'));
		assert(!glob.match(p, 'C:\\testing.js\\foo'));

		p = '**/foo.js';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, '/foo.js'));
		assert(glob.match(p, '\\foo.js'));
		assert(glob.match(p, 'testing/foo.js'));
		assert(glob.match(p, 'testing\\foo.js'));
		assert(glob.match(p, '/testing/foo.js'));
		assert(glob.match(p, '\\testing\\foo.js'));
		assert(glob.match(p, 'C:\\testing\\foo.js'));
	});

	test('cached properly', function () {
		let p = '**/*.js';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'testing/foo.js'));
		assert(glob.match(p, 'testing\\foo.js'));
		assert(glob.match(p, '/testing/foo.js'));
		assert(glob.match(p, '\\testing\\foo.js'));
		assert(glob.match(p, 'C:\\testing\\foo.js'));

		assert(!glob.match(p, 'foo.ts'));
		assert(!glob.match(p, 'testing/foo.ts'));
		assert(!glob.match(p, 'testing\\foo.ts'));
		assert(!glob.match(p, '/testing/foo.ts'));
		assert(!glob.match(p, '\\testing\\foo.ts'));
		assert(!glob.match(p, 'C:\\testing\\foo.ts'));

		assert(!glob.match(p, 'foo.js.txt'));
		assert(!glob.match(p, 'testing/foo.js.txt'));
		assert(!glob.match(p, 'testing\\foo.js.txt'));
		assert(!glob.match(p, '/testing/foo.js.txt'));
		assert(!glob.match(p, '\\testing\\foo.js.txt'));
		assert(!glob.match(p, 'C:\\testing\\foo.js.txt'));

		assert(!glob.match(p, 'testing.js/foo'));
		assert(!glob.match(p, 'testing.js\\foo'));
		assert(!glob.match(p, '/testing.js/foo'));
		assert(!glob.match(p, '\\testing.js\\foo'));
		assert(!glob.match(p, 'C:\\testing.js\\foo'));

		// Run again and make sure the regex are properly reused

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'testing/foo.js'));
		assert(glob.match(p, 'testing\\foo.js'));
		assert(glob.match(p, '/testing/foo.js'));
		assert(glob.match(p, '\\testing\\foo.js'));
		assert(glob.match(p, 'C:\\testing\\foo.js'));

		assert(!glob.match(p, 'foo.ts'));
		assert(!glob.match(p, 'testing/foo.ts'));
		assert(!glob.match(p, 'testing\\foo.ts'));
		assert(!glob.match(p, '/testing/foo.ts'));
		assert(!glob.match(p, '\\testing\\foo.ts'));
		assert(!glob.match(p, 'C:\\testing\\foo.ts'));

		assert(!glob.match(p, 'foo.js.txt'));
		assert(!glob.match(p, 'testing/foo.js.txt'));
		assert(!glob.match(p, 'testing\\foo.js.txt'));
		assert(!glob.match(p, '/testing/foo.js.txt'));
		assert(!glob.match(p, '\\testing\\foo.js.txt'));
		assert(!glob.match(p, 'C:\\testing\\foo.js.txt'));

		assert(!glob.match(p, 'testing.js/foo'));
		assert(!glob.match(p, 'testing.js\\foo'));
		assert(!glob.match(p, '/testing.js/foo'));
		assert(!glob.match(p, '\\testing.js\\foo'));
		assert(!glob.match(p, 'C:\\testing.js\\foo'));
	});

	test('invalid glob', function () {
		let p = '**/*(.js';

		assert(!glob.match(p, 'foo.js'));
	});

	test('split glob aware', function () {
		assert.deepEqual(glob.splitGlobAware('foo,bar', ','), ['foo', 'bar']);
		assert.deepEqual(glob.splitGlobAware('foo', ','), ['foo']);
		assert.deepEqual(glob.splitGlobAware('{foo,bar}', ','), ['{foo,bar}']);
		assert.deepEqual(glob.splitGlobAware('foo,bar,{foo,bar}', ','), ['foo', 'bar', '{foo,bar}']);
		assert.deepEqual(glob.splitGlobAware('{foo,bar},foo,bar,{foo,bar}', ','), ['{foo,bar}', 'foo', 'bar', '{foo,bar}']);

		assert.deepEqual(glob.splitGlobAware('[foo,bar]', ','), ['[foo,bar]']);
		assert.deepEqual(glob.splitGlobAware('foo,bar,[foo,bar]', ','), ['foo', 'bar', '[foo,bar]']);
		assert.deepEqual(glob.splitGlobAware('[foo,bar],foo,bar,[foo,bar]', ','), ['[foo,bar]', 'foo', 'bar', '[foo,bar]']);
	});

	test('expression with disabled glob', function () {
		let expr = { '**/*.js': false };

		assert.strictEqual(glob.match(expr, 'foo.js'), null);
	});

	test('expression with two non-trivia globs', function () {
		let expr = {
			'**/*.j?': true,
			'**/*.t?': true
		};

		assert.strictEqual(glob.match(expr, 'foo.js'), '**/*.j?');
		assert.strictEqual(glob.match(expr, 'foo.as'), null);
	});

	test('expression with empty glob', function () {
		let expr = { '': true };

		assert.strictEqual(glob.match(expr, 'foo.js'), null);
	});

	test('expression with other falsy value', function () {
		let expr = { '**/*.js': 0 };

		assert.strictEqual(glob.match(expr, 'foo.js'), '**/*.js');
	});

	test('expression with two basename globs', function () {
		let expr = {
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
		let expr = {
			'**/bar': true,
			'**/baz': true,
			'**/*.js': { when: '$(basename).ts' }
		};

		let sibilings = () => ['foo.ts', 'foo.js', 'foo', 'bar'];

		assert.strictEqual(glob.match(expr, 'bar', sibilings), '**/bar');
		assert.strictEqual(glob.match(expr, 'foo', sibilings), null);
		assert.strictEqual(glob.match(expr, 'foo/bar', sibilings), '**/bar');
		assert.strictEqual(glob.match(expr, 'foo\\bar', sibilings), '**/bar');
		assert.strictEqual(glob.match(expr, 'foo/foo', sibilings), null);
		assert.strictEqual(glob.match(expr, 'foo.js', sibilings), '**/*.js');
		assert.strictEqual(glob.match(expr, 'bar.js', sibilings), null);
	});

	test('expression with multipe basename globs', function () {
		let expr = {
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

		let expr = { '**/*.js': { when: '$(basename).ts' } };
		let sibilings = () => ['foo.ts', 'foo.js'];

		assert.strictEqual(glob.parse(expr)('bar/baz.js', 'baz.js', sibilings), null);
		assert.strictEqual(glob.parse(expr)('bar/foo.js', 'foo.js', sibilings), '**/*.js');
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

		const siblingsFn = () => ['baz', 'baz.zip', 'nope'];
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
				siblingsFn,
				siblingsFn
			]);
	});

	function testOptimizationForBasenames(pattern: string | glob.IExpression, basenameTerms: string[], matches: [string, string | boolean][], siblingsFns: (() => string[])[] = []) {
		const parsed = glob.parse(<glob.IExpression>pattern, { trimForExclusions: true });
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

		const siblingsFn = () => ['baz', 'baz.zip', 'nope'];
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
				siblingsFn,
				siblingsFn
			]);
	});

	function testOptimizationForPaths(pattern: string | glob.IExpression, pathTerms: string[], matches: [string, string | boolean][], siblingsFns: (() => string[])[] = []) {
		const parsed = glob.parse(<glob.IExpression>pattern, { trimForExclusions: true });
		assert.deepStrictEqual(glob.getPathTerms(parsed), pathTerms);
		matches.forEach(([text, result], i) => {
			assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
		});
	}

	function nativeSep(slashPath: string): string {
		return slashPath.replace(/\//g, path.sep);
	}
});