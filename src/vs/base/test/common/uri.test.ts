/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { parse, stringify } from 'vs/base/common/marshalling';
import { normalize } from 'vs/base/common/paths';

suite('URI', () => {
	test('file#toString', () => {
		assert.equal(URI.file('c:/win/path').toString(), 'file:///c%3A/win/path');
		assert.equal(URI.file('C:/win/path').toString(), 'file:///c%3A/win/path');
		assert.equal(URI.file('c:/win/path/').toString(), 'file:///c%3A/win/path/');
		assert.equal(URI.file('/c:/win/path').toString(), 'file:///c%3A/win/path');
		assert.equal(URI.file('c:\\win\\path').toString(), 'file:///c%3A/win/path');
		assert.equal(URI.file('c:\\win/path').toString(), 'file:///c%3A/win/path');
	});

	test('file#path', () => {
		assert.equal(URI.file('c:/win/path').fsPath.replace(/\\/g, '/'), 'c:/win/path');
		assert.equal(URI.file('c:/win/path/').fsPath.replace(/\\/g, '/'), 'c:/win/path/');
		assert.equal(URI.file('C:/win/path').fsPath.replace(/\\/g, '/'), 'c:/win/path');
		assert.equal(URI.file('/c:/win/path').fsPath.replace(/\\/g, '/'), 'c:/win/path');
		assert.equal(URI.file('./c/win/path').fsPath.replace(/\\/g, '/'), '/./c/win/path');
		assert.equal(URI.file('c:\\win\\path').fsPath.replace(/\\/g, '/'), 'c:/win/path');
		assert.equal(URI.file('c:\\win/path').fsPath.replace(/\\/g, '/'), 'c:/win/path');
	});

	test('http#toString', () => {
		assert.equal(URI.create('http', 'www.msft.com', '/my/path').toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.create('http', 'www.msft.com', '/my/path').toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.create('http', 'www.MSFT.com', '/my/path').toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.create('http', '', 'my/path').toString(), 'http:my/path');
		assert.equal(URI.create('http', '', '/my/path').toString(), 'http:/my/path');
		assert.equal(URI.create('', '', 'my/path').toString(), 'my/path');
		assert.equal(URI.create('', '', '/my/path').toString(), '/my/path');
	});

	test('with', () => {
		assert.equal(URI.create().withScheme('http').withPath('/api/files/test.me').withQuery('t=1234').toString(), 'http:/api/files/test.me?t=1234');
		assert.equal(URI.create().with('http', '', '/api/files/test.me', 't=1234', '').toString(), 'http:/api/files/test.me?t=1234');
		assert.equal(URI.create().with('https', '', '/api/files/test.me', 't=1234', '').toString(), 'https:/api/files/test.me?t=1234');
		assert.equal(URI.create().with('HTTP', '', '/api/files/test.me', 't=1234', '').toString(), 'HTTP:/api/files/test.me?t=1234');
		assert.equal(URI.create().with('HTTPS', '', '/api/files/test.me', 't=1234', '').toString(), 'HTTPS:/api/files/test.me?t=1234');
		assert.equal(URI.create().with('boo', '', '/api/files/test.me', 't=1234', '').toString(), 'boo:/api/files/test.me?t%3D1234');
	});

	test('parse', () => {
		var value = URI.parse('http:/api/files/test.me?t=1234');
		assert.equal(value.scheme, 'http');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/api/files/test.me');
		assert.equal(value.query, 't=1234');
		assert.equal(value.fragment, '');

		value = URI.parse('http://api/files/test.me?t=1234');
		assert.equal(value.scheme, 'http');
		assert.equal(value.authority, 'api');
		assert.equal(value.path, '/files/test.me');
		assert.equal(value.fsPath, normalize('/files/test.me', true));
		assert.equal(value.query, 't=1234');
		assert.equal(value.fragment, '');

		value = URI.parse('inmemory:');
		assert.equal(value.scheme, 'inmemory');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('api/files/test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'api/files/test');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('api');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'api');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('/api/files/test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/api/files/test');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('?test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, 'test');
		assert.equal(value.fragment, '');

		value = URI.parse('#test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, 'test');
	});

	// Useful reference:
	test('unc', () => {
		var uri = URI.file('\\\\localhost\\c$\\GitDevelopment\\express');

		assert.equal(uri.toString(), 'file://localhost/c%24/GitDevelopment/express');
		assert.equal(uri.path, '/c$/GitDevelopment/express');
		assert.equal(uri.fsPath, normalize('//localhost/c$/GitDevelopment/express', true));
	});

	// Useful reference:
	test('correctFileUriToFilePath', () => {

		var test = (input: string, expected: string) => {
			expected = normalize(expected, true);
			assert.equal(URI.parse(input).fsPath, expected, 'Result for ' + input);
		};

		test('file:///c:/alex.txt', 'c:\\alex.txt');
		test('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins',
			'c:\\Source\\Zürich or Zurich (ˈzjʊərɪk,\\Code\\resources\\app\\plugins');
		test('file://monacotools/isi.txt', '\\\\monacotools\\isi.txt');
		test('file://monacotools1/certificates/SSL/', '\\\\monacotools1\\certificates\\SSL\\');
	});

	test('Bug 16793:# in folder name => mirror models get out of sync', () => {
		var uri1 = URI.file('C:\\C#\\file.txt');
		assert.equal(parse(stringify(uri1)).toString(), uri1.toString());
	});

	test('URI#parse', () => {

		var value = URI.parse('file:///c:/test/me');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/c:/test/me');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');
		assert.equal(value.fsPath, normalize('c:/test/me', true));

		value = URI.parse('file://shares/files/c%23/p.cs');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, 'shares');
		assert.equal(value.path, '/files/c#/p.cs');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');
		assert.equal(value.fsPath, normalize('//shares/files/c#/p.cs', true));

		value = URI.parse('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins/c%23/plugin.json');
		assert.equal(value.path, '/c:/Source/Zürich or Zurich (ˈzjʊərɪk,/Code/resources/app/plugins/c#/plugin.json');

		value = URI.parse('file:///c:/test %25/path');
		assert.equal(value.path, '/c:/test %/path');

		value = URI.parse('file:#d');
		assert.equal(value.scheme, 'file');
		assert.equal(value.fragment, 'd');

		value = URI.parse('file:?q');
		assert.equal(value.scheme, 'file');
		assert.equal(value.query, 'q');

		value = URI.parse('http:/api/files/test.me?t=1234');
		assert.equal(value.scheme, 'http');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/api/files/test.me');
		assert.equal(value.query, 't=1234');
		assert.equal(value.fragment, '');

		value = URI.parse('http://api/files/test.me?t=1234');
		assert.equal(value.scheme, 'http');
		assert.equal(value.authority, 'api');
		assert.equal(value.path, '/files/test.me');
		assert.equal(value.query, 't=1234');
		assert.equal(value.fragment, '');

		value = URI.parse('inmemory:');
		assert.equal(value.scheme, 'inmemory');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('api/files/test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'api/files/test');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('api');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'api');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('/api/files/test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/api/files/test');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('?test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, 'test');
		assert.equal(value.fragment, '');

		value = URI.parse('#test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, 'test');
	});

	test('URI#parse, disallow //path when no authority', () => {

		assert.throws(() => URI.parse('file:////shares/files/p.cs'));

		var value = URI.parse('file://shares//files/p.cs');
		assert.equal(value.authority, 'shares');
		assert.equal(value.path, '//files/p.cs');

		value = URI.parse('file:///j%3A//');
		assert.equal(value.path, '/j://');
	});

	test('URI#file', () => {

		var value = URI.file('\\\\shäres\\path\\c#\\plugin.json');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, 'shäres');
		assert.equal(value.path, '/path/c#/plugin.json');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');
		assert.equal(value.toString(), 'file://sh%C3%A4res/path/c%23/plugin.json');

		// identity toString -> parse -> toString
		value = URI.parse(value.toString());
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, 'shäres');
		assert.equal(value.path, '/path/c#/plugin.json');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');
		assert.equal(value.toString(), 'file://sh%C3%A4res/path/c%23/plugin.json');

		value = URI.file('c:\\test with %\\path');
		assert.equal(value.path, '/c:/test with %/path');
		assert.equal(value.toString(), 'file:///c%3A/test%20with%20%25/path');

		value = URI.file('c:\\test with %25\\path');
		assert.equal(value.path, '/c:/test with %25/path');
		assert.equal(value.toString(), 'file:///c%3A/test%20with%20%2525/path');

		value = URI.file('c:\\test with %25\\c#code');
		assert.equal(value.path, '/c:/test with %25/c#code');
		assert.equal(value.toString(), 'file:///c%3A/test%20with%20%2525/c%23code');
	});

	test('URI#file, auto-slash windows drive letter', () => {

		var value = URI.file('c:\\test\\drive');
		assert.equal(value.path, '/c:/test/drive');
		assert.equal(value.toString(), 'file:///c%3A/test/drive');
	});

	test('URI#file, always slash', () => {

		var value = URI.file('a.file');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/a.file');
		assert.equal(value.toString(), 'file:///a.file');

		value = URI.parse(value.toString());
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/a.file');
		assert.equal(value.toString(), 'file:///a.file');
	});

	test('URI#file, disallow scheme', () => {
		assert.throws(() => URI.file('file:///some/path'));
	});

	test('URI.toString, only scheme and query', () => {
		var value = URI.parse('stuff:?qüery');
		assert.equal(value.toString(), 'stuff:?q%C3%BCery');
	});

	test('URI#toString, upper-case percent espaces', () => {
		var value = URI.parse('file://sh%c3%a4res/path');
		assert.equal(value.toString(), 'file://sh%C3%A4res/path');
	});

	test('URI#toString, escape all the bits', () => {

		var value = URI.file('/Users/jrieken/Code/_samples/18500/Mödel + Other Thîngß/model.js');
		assert.equal(value.toString(), 'file:///Users/jrieken/Code/_samples/18500/M%C3%B6del%20%2B%20Other%20Th%C3%AEng%C3%9F/model.js');
	});

	test('URI#toString, don\'t encode port', () => {
		var value = URI.parse('http://localhost:8080/far');
		assert.equal(value.toString(), 'http://localhost:8080/far');

		value = URI.create('http', 'löcalhost:8080', '/far', undefined, undefined);
		assert.equal(value.toString(), 'http://l%C3%B6calhost:8080/far');
	});

	test('correctFileUriToFilePath2', () => {

		var test = (input: string, expected: string) => {
			expected = normalize(expected, true);
			var value = URI.parse(input);
			assert.equal(value.fsPath, expected, 'Result for ' + input);
			var value2 = URI.file(value.fsPath);
			assert.equal(value2.fsPath, expected, 'Result for ' + input);
			assert.equal(value.toString(), value2.toString());
		};

		test('file:///c:/alex.txt', 'c:\\alex.txt');
		test('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins',
			'c:\\Source\\Zürich or Zurich (ˈzjʊərɪk,\\Code\\resources\\app\\plugins');
		test('file://monacotools/isi.txt', '\\\\monacotools\\isi.txt');
		test('file://monacotools1/certificates/SSL/', '\\\\monacotools1\\certificates\\SSL\\');
	});

	test('URI - (de)serialize', function() {

		var values = [
			URI.parse('http://localhost:8080/far'),
			URI.file('c:\\test with %25\\c#code'),
			URI.file('\\\\shäres\\path\\c#\\plugin.json'),
			URI.parse('http://api/files/test.me?t=1234'),
			URI.parse('http://api/files/test.me?t=1234#fff'),
			URI.parse('http://api/files/test.me#fff'),
		];

		// console.profile();
		// let c = 100000;
		// while (c-- > 0) {
		for(let value of values) {
			let data = value.toJSON();
			let clone = URI.revive(data);

			assert.equal(clone.scheme, value.scheme);
			assert.equal(clone.authority, value.authority);
			assert.equal(clone.path, value.path);
			assert.equal(clone.query, value.query);
			assert.equal(clone.fragment, value.fragment);
			assert.equal(clone.fsPath, value.fsPath);
			assert.equal(clone.toString(), value.toString());
		}
		// }
		// console.profileEnd();
	});

	test('URI - http, query & toString', function() {

		let uri = URI.parse('http://go.microsoft.com/fwlink/?LinkId=518008');
		assert.equal(uri.query, 'LinkId=518008')
		assert.equal(uri.toString(), 'http://go.microsoft.com/fwlink/?LinkId=518008');

		let uri2 = URI.parse(uri.toString());
		assert.equal(uri2.query, 'LinkId=518008');
		assert.equal(uri2.query, uri.query);

		uri = URI.parse('http://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.query, 'LinkId=518008&foö&ké¥=üü')
		assert.equal(uri.toString(), 'http://go.microsoft.com/fwlink/?LinkId=518008&fo%C3%B6&k%C3%A9%C2%A5=%C3%BC%C3%BC');
	});
});