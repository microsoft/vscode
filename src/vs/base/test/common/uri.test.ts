/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { normalize } from 'vs/base/common/paths';
import { isWindows } from 'vs/base/common/platform';


suite('URI', () => {
	test('file#toString', () => {
		assert.equal(URI.file('c:/win/path').toString(), 'file:///c%3A/win/path');
		assert.equal(URI.file('C:/win/path').toString(), 'file:///c%3A/win/path');
		assert.equal(URI.file('c:/win/path/').toString(), 'file:///c%3A/win/path/');
		assert.equal(URI.file('/c:/win/path').toString(), 'file:///c%3A/win/path');
	});

	test('URI.file (win-special)', () => {
		if (isWindows) {
			assert.equal(URI.file('c:\\win\\path').toString(), 'file:///c%3A/win/path');
			assert.equal(URI.file('c:\\win/path').toString(), 'file:///c%3A/win/path');
		} else {
			assert.equal(URI.file('c:\\win\\path').toString(), 'file:///c%3A%5Cwin%5Cpath');
			assert.equal(URI.file('c:\\win/path').toString(), 'file:///c%3A%5Cwin/path');

		}
	});

	test('file#fsPath (win-special)', () => {
		if (isWindows) {
			assert.equal(URI.file('c:\\win\\path').fsPath, 'c:\\win\\path');
			assert.equal(URI.file('c:\\win/path').fsPath, 'c:\\win\\path');

			assert.equal(URI.file('c:/win/path').fsPath, 'c:\\win\\path');
			assert.equal(URI.file('c:/win/path/').fsPath, 'c:\\win\\path\\');
			assert.equal(URI.file('C:/win/path').fsPath, 'c:\\win\\path');
			assert.equal(URI.file('/c:/win/path').fsPath, 'c:\\win\\path');
			assert.equal(URI.file('./c/win/path').fsPath, '\\.\\c\\win\\path');
		} else {
			assert.equal(URI.file('c:/win/path').fsPath, 'c:/win/path');
			assert.equal(URI.file('c:/win/path/').fsPath, 'c:/win/path/');
			assert.equal(URI.file('C:/win/path').fsPath, 'c:/win/path');
			assert.equal(URI.file('/c:/win/path').fsPath, 'c:/win/path');
			assert.equal(URI.file('./c/win/path').fsPath, '/./c/win/path');
		}
	});

	test('URI#fsPath - no `fsPath` when no `path`', () => {
		const value = URI.parse('file://%2Fhome%2Fticino%2Fdesktop%2Fcpluscplus%2Ftest.cpp');
		assert.equal(value.authority, '/home/ticino/desktop/cpluscplus/test.cpp');
		assert.equal(value.path, '');
		assert.equal(value.fsPath, '');
	});

	test('http#toString', () => {
		assert.equal(URI.from({ scheme: 'http', authority: 'www.msft.com', path: '/my/path' }).toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: 'www.msft.com', path: '/my/path' }).toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: 'www.MSFT.com', path: '/my/path' }).toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: '', path: 'my/path' }).toString(), 'http:my/path');
		assert.equal(URI.from({ scheme: 'http', authority: '', path: '/my/path' }).toString(), 'http:/my/path');
		assert.equal(URI.from({ scheme: '', authority: '', path: 'my/path' }).toString(), 'my/path');
		assert.equal(URI.from({ scheme: '', authority: '', path: '/my/path' }).toString(), '/my/path');
		//http://a-test-site.com/#test=true
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: 'test=true' }).toString(), 'http://a-test-site.com/?test%3Dtrue');
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: '', fragment: 'test=true' }).toString(), 'http://a-test-site.com/#test%3Dtrue');
	});

	test('http#toString, encode=FALSE', () => {
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: 'test=true' }).toString(true), 'http://a-test-site.com/?test=true');
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: '', fragment: 'test=true' }).toString(true), 'http://a-test-site.com/#test=true');
		assert.equal(URI.from({}).with({ scheme: 'http', path: '/api/files/test.me', query: 't=1234' }).toString(true), 'http:/api/files/test.me?t=1234');

		var value = URI.parse('file://shares/pröjects/c%23/#l12');
		assert.equal(value.authority, 'shares');
		assert.equal(value.path, '/pröjects/c#/');
		assert.equal(value.fragment, 'l12');
		assert.equal(value.toString(), 'file://shares/pr%C3%B6jects/c%23/#l12');
		assert.equal(value.toString(true), 'file://shares/pröjects/c%23/#l12');

		var uri2 = URI.parse(value.toString(true));
		var uri3 = URI.parse(value.toString());
		assert.equal(uri2.authority, uri3.authority);
		assert.equal(uri2.path, uri3.path);
		assert.equal(uri2.query, uri3.query);
		assert.equal(uri2.fragment, uri3.fragment);
	});

	test('with, identity', () => {
		let uri = URI.parse('foo:bar/path');

		let uri2 = uri.with(null);
		assert.ok(uri === uri2);
		uri2 = uri.with(undefined);
		assert.ok(uri === uri2);
		uri2 = uri.with({});
		assert.ok(uri === uri2);
		uri2 = uri.with({ scheme: 'foo', path: 'bar/path' });
		assert.ok(uri === uri2);
	});

	test('with, changes', () => {
		assert.equal(URI.parse('before:some/file/path').with({ scheme: 'after' }).toString(), 'after:some/file/path');
		assert.equal(URI.from({}).with({ scheme: 'http', path: '/api/files/test.me', query: 't=1234' }).toString(), 'http:/api/files/test.me?t%3D1234');
		assert.equal(URI.from({}).with({ scheme: 'http', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'http:/api/files/test.me?t%3D1234');
		assert.equal(URI.from({}).with({ scheme: 'https', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'https:/api/files/test.me?t%3D1234');
		assert.equal(URI.from({}).with({ scheme: 'HTTP', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'HTTP:/api/files/test.me?t%3D1234');
		assert.equal(URI.from({}).with({ scheme: 'HTTPS', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'HTTPS:/api/files/test.me?t%3D1234');
		assert.equal(URI.from({}).with({ scheme: 'boo', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'boo:/api/files/test.me?t%3D1234');
	});

	test('with, remove components #8465', () => {
		assert.equal(URI.parse('scheme://authority/path').with({ authority: '' }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ authority: '' }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ authority: null }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ path: '' }).toString(), 'scheme://authority');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ path: null }).toString(), 'scheme://authority');
		assert.equal(URI.parse('scheme:/path').with({ authority: '' }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: null }).toString(), 'scheme:/path');
	});

	test('with, validation', () => {
		let uri = URI.parse('foo:bar/path');
		assert.throws(() => uri.with({ scheme: 'fai:l' }));
		assert.throws(() => uri.with({ scheme: 'fäil' }));
		assert.throws(() => uri.with({ authority: 'fail' }));
		assert.throws(() => uri.with({ path: '//fail' }));
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

		value = URI.parse('file:///c:/test/me');
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
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/c:/Source/Zürich or Zurich (ˈzjʊərɪk,/Code/resources/app/plugins/c#/plugin.json');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');

		value = URI.parse('file:///c:/test %25/path');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/c:/test %/path');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');

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

		value = URI.parse('file:?q');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, 'q');
		assert.equal(value.fragment, '');

		value = URI.parse('#test');
		assert.equal(value.scheme, '');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, 'test');

		value = URI.parse('file:#d');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, 'd');

		value = URI.parse('f3ile:#d');
		assert.equal(value.scheme, 'f3ile');
		assert.equal(value.authority, '');
		assert.equal(value.path, '');
		assert.equal(value.query, '');
		assert.equal(value.fragment, 'd');

		value = URI.parse('foo+bar:path');
		assert.equal(value.scheme, 'foo+bar');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'path');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('foo-bar:path');
		assert.equal(value.scheme, 'foo-bar');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'path');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('foo.bar:path');
		assert.equal(value.scheme, 'foo.bar');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'path');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');
	});

	test('parse, disallow //path when no authority', () => {
		assert.throws(() => URI.parse('file:////shares/files/p.cs'));
	});

	test('URI#file, win-speciale', () => {
		if (isWindows) {
			var value = URI.file('c:\\test\\drive');
			assert.equal(value.path, '/c:/test/drive');
			assert.equal(value.toString(), 'file:///c%3A/test/drive');

			value = URI.file('\\\\shäres\\path\\c#\\plugin.json');
			assert.equal(value.scheme, 'file');
			assert.equal(value.authority, 'shäres');
			assert.equal(value.path, '/path/c#/plugin.json');
			assert.equal(value.fragment, '');
			assert.equal(value.query, '');
			assert.equal(value.toString(), 'file://sh%C3%A4res/path/c%23/plugin.json');

			value = URI.file('\\\\localhost\\c$\\GitDevelopment\\express');
			assert.equal(value.scheme, 'file');
			assert.equal(value.path, '/c$/GitDevelopment/express');
			assert.equal(value.fsPath, '\\\\localhost\\c$\\GitDevelopment\\express');
			assert.equal(value.query, '');
			assert.equal(value.fragment, '');
			assert.equal(value.toString(), 'file://localhost/c%24/GitDevelopment/express');

			value = URI.file('c:\\test with %\\path');
			assert.equal(value.path, '/c:/test with %/path');
			assert.equal(value.toString(), 'file:///c%3A/test%20with%20%25/path');

			value = URI.file('c:\\test with %25\\path');
			assert.equal(value.path, '/c:/test with %25/path');
			assert.equal(value.toString(), 'file:///c%3A/test%20with%20%2525/path');

			value = URI.file('c:\\test with %25\\c#code');
			assert.equal(value.path, '/c:/test with %25/c#code');
			assert.equal(value.toString(), 'file:///c%3A/test%20with%20%2525/c%23code');

			value = URI.file('\\\\shares');
			assert.equal(value.scheme, 'file');
			assert.equal(value.authority, 'shares');
			assert.equal(value.path, '/'); // slash is always there

			value = URI.file('\\\\shares\\');
			assert.equal(value.scheme, 'file');
			assert.equal(value.authority, 'shares');
			assert.equal(value.path, '/');
		}
	});

	test('URI#file, no path-is-uri check', () => {

		// we don't complain here
		let value = URI.file('file://path/to/file');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/file://path/to/file');
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

	test('URI.toString, only scheme and query', () => {
		var value = URI.parse('stuff:?qüery');
		assert.equal(value.toString(), 'stuff:?q%C3%BCery');
	});

	test('URI#toString, upper-case percent espaces', () => {
		var value = URI.parse('file://sh%c3%a4res/path');
		assert.equal(value.toString(), 'file://sh%C3%A4res/path');
	});

	test('URI#toString, lower-case windows drive letter', () => {
		assert.equal(URI.parse('untitled:c:/Users/jrieken/Code/abc.txt').toString(), 'untitled:c%3A/Users/jrieken/Code/abc.txt');
		assert.equal(URI.parse('untitled:C:/Users/jrieken/Code/abc.txt').toString(), 'untitled:c%3A/Users/jrieken/Code/abc.txt');
	});

	test('URI#toString, escape all the bits', () => {

		var value = URI.file('/Users/jrieken/Code/_samples/18500/Mödel + Other Thîngß/model.js');
		assert.equal(value.toString(), 'file:///Users/jrieken/Code/_samples/18500/M%C3%B6del%20%2B%20Other%20Th%C3%AEng%C3%9F/model.js');
	});

	test('URI#toString, don\'t encode port', () => {
		var value = URI.parse('http://localhost:8080/far');
		assert.equal(value.toString(), 'http://localhost:8080/far');

		value = URI.from({ scheme: 'http', authority: 'löcalhost:8080', path: '/far', query: undefined, fragment: undefined });
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
		test('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins', 'c:\\Source\\Zürich or Zurich (ˈzjʊərɪk,\\Code\\resources\\app\\plugins');
		test('file://monacotools/folder/isi.txt', '\\\\monacotools\\folder\\isi.txt');
		test('file://monacotools1/certificates/SSL/', '\\\\monacotools1\\certificates\\SSL\\');
	});

	test('URI - http, query & toString', function () {

		let uri = URI.parse('https://go.microsoft.com/fwlink/?LinkId=518008');
		assert.equal(uri.query, 'LinkId=518008');
		assert.equal(uri.toString(true), 'https://go.microsoft.com/fwlink/?LinkId=518008');
		assert.equal(uri.toString(), 'https://go.microsoft.com/fwlink/?LinkId%3D518008');

		let uri2 = URI.parse(uri.toString());
		assert.equal(uri2.query, 'LinkId=518008');
		assert.equal(uri2.query, uri.query);

		uri = URI.parse('https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.query, 'LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.toString(true), 'https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.toString(), 'https://go.microsoft.com/fwlink/?LinkId%3D518008%26fo%C3%B6%26k%C3%A9%C2%A5%3D%C3%BC%C3%BC');

		uri2 = URI.parse(uri.toString());
		assert.equal(uri2.query, 'LinkId=518008&foö&ké¥=üü');
		assert.equal(uri2.query, uri.query);
	});


	test('URI - (de)serialize', function () {

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
		for (let value of values) {
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
});
