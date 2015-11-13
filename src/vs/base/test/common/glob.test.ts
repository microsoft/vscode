/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import glob = require('vs/base/common/glob');

suite('Glob', () => {
	test('simple', function() {
		var p = 'node_modules';

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

	test('dot hidden', function() {
		var p = '.*';

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

	test('file pattern', function() {
		var p = '*.js';

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

	test('star', function() {
		var p = 'node*modules';

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

	test('questionmark', function() {
		var p = 'node?modules';

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

	test('globstar', function() {
		var p = '**/*.js';

		assert(glob.match(p, 'foo.js'));
		assert(glob.match(p, 'folder/foo.js'));
		assert(glob.match(p, '/node_modules/foo.js'));
		assert(!glob.match(p, 'foo.jss'));
		assert(!glob.match(p, 'some.js/test'));
		assert(!glob.match(p, '/some.js/test'));
		assert(!glob.match(p, '\\some.js\\test'));

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
	});

	test('brace expansion', function() {
		var p = '*.{html,js}';

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

	test('expression support (single)', function() {
		var siblings = ['test.html', 'test.txt', 'test.ts', 'test.js'];

		// { "**/*.js": { "when": "$(basename).ts" } }
		var expression:glob.IExpression = {
			'**/*.js': {
				when: '$(basename).ts'
			}
		};

		assert.equal('**/*.js', glob.match(expression, 'test.js', siblings));
		assert(!glob.match(expression, 'test.js', []));
		assert(!glob.match(expression, 'test.js', ['te.ts']));
		assert(!glob.match(expression, 'test.js'));

		expression = {
			'**/*.js': {
				when: ''
			}
		};

		assert(!glob.match(expression, 'test.js', siblings));

		expression = <any>{
			'**/*.js': {
			}
		};

		assert.equal('**/*.js', glob.match(expression, 'test.js', siblings));

		expression = {};

		assert(!glob.match(expression, 'test.js', siblings));
	});

	test('expression support (multiple)', function() {
		var siblings = ['test.html', 'test.txt', 'test.ts', 'test.js'];

		// { "**/*.js": { "when": "$(basename).ts" } }
		var expression:glob.IExpression = {
			'**/*.js': { when: '$(basename).ts' },
			'**/*.as': true,
			'**/*.foo': false,
			'**/*.bananas': { bananas: true }
		};

		assert.equal('**/*.js', glob.match(expression, 'test.js', siblings));
		assert.equal('**/*.as', glob.match(expression, 'test.as', siblings));
		assert.equal('**/*.bananas', glob.match(expression, 'test.bananas', siblings));
		assert.equal('**/*.bananas', glob.match(expression, 'test.bananas'));
		assert(!glob.match(expression, 'test.foo', siblings));
	});

	test('brackets', function() {
		var p = 'foo.[0-9]';

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

	test('backslash agnostic', function() {
		var p = 'testing/this/foo.txt';

		assert(glob.match(p, 'testing/this/foo.txt'));
		assert(glob.match(p, 'testing\\this\\foo.txt'));
		assert(glob.match(p, 'testing/this\\foo.txt'));
	});

	test('prefix agnostic', function() {
		var p = '**/*.js';

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

	test('cached properly', function() {
		var p = '**/*.js';

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

	test('invalid glob', function() {
		var p = '**/*(.js';

		assert(!glob.match(p, 'foo.js'));
	});

	test('split glob aware', function() {
		assert.deepEqual(glob.splitGlobAware('foo,bar', ','), ['foo', 'bar']);
		assert.deepEqual(glob.splitGlobAware('foo', ','), ['foo']);
		assert.deepEqual(glob.splitGlobAware('{foo,bar}', ','), ['{foo,bar}']);
		assert.deepEqual(glob.splitGlobAware('foo,bar,{foo,bar}', ','), ['foo', 'bar', '{foo,bar}']);
		assert.deepEqual(glob.splitGlobAware('{foo,bar},foo,bar,{foo,bar}', ','), ['{foo,bar}', 'foo', 'bar', '{foo,bar}']);

		assert.deepEqual(glob.splitGlobAware('[foo,bar]', ','), ['[foo,bar]']);
		assert.deepEqual(glob.splitGlobAware('foo,bar,[foo,bar]', ','), ['foo', 'bar', '[foo,bar]']);
		assert.deepEqual(glob.splitGlobAware('[foo,bar],foo,bar,[foo,bar]', ','), ['[foo,bar]', 'foo', 'bar', '[foo,bar]']);
	});
});