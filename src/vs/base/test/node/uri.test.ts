/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI, UriComponents } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';
import { pathToFileURL, fileURLToPath } from 'url';

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
		assert.equal(value.path, '/');
		if (isWindows) {
			assert.equal(value.fsPath, '\\');
		} else {
			assert.equal(value.fsPath, '/');
		}
	});

	test('http#toString', () => {
		assert.equal(URI.from({ scheme: 'http', authority: 'www.msft.com', path: '/my/path' }).toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: 'www.msft.com', path: '/my/path' }).toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: 'www.MSFT.com', path: '/my/path' }).toString(), 'http://www.msft.com/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: '', path: 'my/path' }).toString(), 'http:/my/path');
		assert.equal(URI.from({ scheme: 'http', authority: '', path: '/my/path' }).toString(), 'http:/my/path');
		//http://a-test-site.com/#test=true
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: 'test=true' }).toString(), 'http://a-test-site.com/?test=true');
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: '', fragment: 'test=true' }).toString(), 'http://a-test-site.com/#test=true');
	});

	test('http#toString, encode=FALSE', () => {
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: 'test=true' }).toString(true), 'http://a-test-site.com/?test=true');
		assert.equal(URI.from({ scheme: 'http', authority: 'a-test-site.com', path: '/', query: '', fragment: 'test=true' }).toString(true), 'http://a-test-site.com/#test=true');
		assert.equal(URI.from({ scheme: 'http', path: '/api/files/test.me', query: 't=1234' }).toString(true), 'http:/api/files/test.me?t=1234');

		const value = URI.parse('file://shares/pröjects/c%23/#l12');
		assert.equal(value.authority, 'shares');
		assert.equal(value.path, '/pröjects/c#/');
		assert.equal(value.fragment, 'l12');
		assert.equal(value.toString(), 'file://shares/pr%C3%B6jects/c%23/#l12');
		assert.equal(value.toString(true), 'file://shares/pröjects/c%23/#l12');

		const uri2 = URI.parse(value.toString(true));
		const uri3 = URI.parse(value.toString());
		assert.equal(uri2.authority, uri3.authority);
		assert.equal(uri2.path, uri3.path);
		assert.equal(uri2.query, uri3.query);
		assert.equal(uri2.fragment, uri3.fragment);
	});

	test('URI#with, identity', () => {
		let uri = URI.parse('foo:bar/path');

		let uri2 = uri.with(null!);
		assert.ok(uri === uri2);
		uri2 = uri.with(undefined!);
		assert.ok(uri === uri2);
		uri2 = uri.with({});
		assert.ok(uri === uri2);
		uri2 = uri.with({ scheme: 'foo', path: 'bar/path' });
		assert.ok(uri === uri2);
	});

	test('URI#with, changes', () => {
		assert.equal(URI.parse('before:some/file/path').with({ scheme: 'after' }).toString(), 'after:some/file/path');
		assert.equal(URI.from({ scheme: 's' }).with({ scheme: 'http', path: '/api/files/test.me', query: 't=1234' }).toString(), 'http:/api/files/test.me?t=1234');
		assert.equal(URI.from({ scheme: 's' }).with({ scheme: 'http', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'http:/api/files/test.me?t=1234');
		assert.equal(URI.from({ scheme: 's' }).with({ scheme: 'https', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'https:/api/files/test.me?t=1234');
		assert.equal(URI.from({ scheme: 's' }).with({ scheme: 'HTTP', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'HTTP:/api/files/test.me?t=1234');
		assert.equal(URI.from({ scheme: 's' }).with({ scheme: 'HTTPS', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'HTTPS:/api/files/test.me?t=1234');
		assert.equal(URI.from({ scheme: 's' }).with({ scheme: 'boo', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'boo:/api/files/test.me?t=1234');
	});

	test('URI#with, remove components #8465', () => {
		assert.equal(URI.parse('scheme://authority/path').with({ authority: '' }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ authority: '' }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ authority: null }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ path: '' }).toString(), 'scheme://authority');
		assert.equal(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ path: null }).toString(), 'scheme://authority');
		assert.equal(URI.parse('scheme:/path').with({ authority: '' }).toString(), 'scheme:/path');
		assert.equal(URI.parse('scheme:/path').with({ authority: null }).toString(), 'scheme:/path');
	});

	test('URI#with, validation', () => {
		let uri = URI.parse('foo:bar/path');
		assert.throws(() => uri.with({ scheme: 'fai:l' }));
		assert.throws(() => uri.with({ scheme: 'fäil' }));
		assert.throws(() => uri.with({ authority: 'fail' }));
		assert.throws(() => uri.with({ path: '//fail' }));
	});

	test('parse', () => {
		let value = URI.parse('http:/api/files/test.me?t=1234');
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

		value = URI.parse('file:///c:/test/me');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/c:/test/me');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');
		assert.equal(value.fsPath, isWindows ? 'c:\\test\\me' : 'c:/test/me');

		value = URI.parse('file://shares/files/c%23/p.cs');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, 'shares');
		assert.equal(value.path, '/files/c#/p.cs');
		assert.equal(value.fragment, '');
		assert.equal(value.query, '');
		assert.equal(value.fsPath, isWindows ? '\\\\shares\\files\\c#\\p.cs' : '//shares/files/c#/p.cs');

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

		value = URI.parse('foo:api/files/test');
		assert.equal(value.scheme, 'foo');
		assert.equal(value.authority, '');
		assert.equal(value.path, 'api/files/test');
		assert.equal(value.query, '');
		assert.equal(value.fragment, '');

		value = URI.parse('file:?q');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/');
		assert.equal(value.query, 'q');
		assert.equal(value.fragment, '');

		value = URI.parse('file:#d');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/');
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

	test('URI#parse, missing scheme', () => {
		assert.throws(() => URI.parse('/foo/bar', true));
		assertToString('/foo/bar', 'file:///foo/bar');
	});

	test('URI#file, win-speciale', () => {
		if (isWindows) {
			let value = URI.file('c:\\test\\drive');
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
			assert.equal(value.toString(), 'file://localhost/c$/GitDevelopment/express');

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

	test('VSCode URI module\'s driveLetterPath regex is incorrect, #32961', function () {
		let uri = URI.parse('file:///_:/path');
		assert.equal(uri.fsPath, isWindows ? '\\_:\\path' : '/_:/path');
	});

	test('URI#file, no path-is-uri check', () => {

		// we don't complain here
		let value = URI.file('file://path/to/file');
		assert.equal(value.scheme, 'file');
		assert.equal(value.authority, '');
		assert.equal(value.path, '/file://path/to/file');
	});

	test('URI#file, always slash', () => {

		let value = URI.file('a.file');
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


	function assertToString(input: string | URI, expected: string) {
		if (typeof input === 'string') {
			input = URI.parse(input);
		}
		const actual = input.toString();
		assert.equal(actual, expected.toString());
	}

	function assertComponents(input: string | URI, scheme: string, authority: string, path: string, query: string, fragment: string) {
		if (typeof input === 'string') {
			input = URI.parse(input);
		}
		assert.equal(input.scheme, scheme);
		assert.equal(input.authority, authority);
		assert.equal(input.path, path);
		assert.equal(input.query, query);
		assert.equal(input.fragment, fragment);
	}

	function assertEqualUri(input: string | URI, other: string | URI) {
		if (typeof input === 'string') {
			input = URI.parse(input);
		}
		if (typeof other === 'string') {
			other = URI.parse(other);
		}
		assert.equal(input.scheme, other.scheme);
		assert.equal(input.authority, other.authority);
		assert.equal(input.path, other.path);
		assert.equal(input.query, other.query);
		assert.equal(input.fragment, other.fragment);
		assert.equal(input.toString(), other.toString());
	}

	test('URI.toString, only scheme and query', () => {
		assertToString('stuff:?qüery', 'stuff:?q%C3%BCery');
	});

	test('URI#toString, upper-case percent espaces', () => {
		assertToString('file://sh%c3%a4res/path', 'file://sh%C3%A4res/path');
		assertToString('file://sh%c3%z4res/path', 'file://sh%C3%z4res/path');
		assertToString('file:///sh%a0res/path', 'file:///sh%A0res/path'); // also upper-cased invalid sequence
	});

	test('URI#toString, lower-case windows drive letter', () => {
		assertToString('untitled:c:/Users/jrieken/Code/abc.txt', 'untitled:c%3A/Users/jrieken/Code/abc.txt');
		assertToString('untitled:C:/Users/jrieken/Code/abc.txt', 'untitled:c%3A/Users/jrieken/Code/abc.txt');
	});

	test('URI#toString, escape all the bits', () => {
		const value = URI.file('/Users/jrieken/Code/_samples/18500/Mödel + Other Thîngß/model.js');
		assertToString(value, 'file:///Users/jrieken/Code/_samples/18500/M%C3%B6del%20+%20Other%20Th%C3%AEng%C3%9F/model.js');
	});

	test('URI#toString, don\'t encode port', () => {
		let value = URI.parse('http://localhost:8080/far');
		assertToString(value, 'http://localhost:8080/far');

		value = URI.from({ scheme: 'http', authority: 'löcalhost:8080', path: '/far', query: undefined, fragment: undefined });
		assertToString(value, 'http://l%C3%B6calhost:8080/far');
	});

	test('URI#toString, user information in authority', () => {
		assertToString('http://foo:bar@localhost/far', 'http://foo:bar@localhost/far');
		assertToString('http://foo@localhost/far', 'http://foo@localhost/far');
		assertToString('http://foo:bAr@localhost:8080/far', 'http://foo:bAr@localhost:8080/far');
		assertToString('http://foo@localhost:8080/far', 'http://foo@localhost:8080/far');
		assertToString(
			URI.from({ scheme: 'http', authority: 'föö:bör@löcalhost:8080', path: '/far', query: undefined, fragment: undefined }),
			'http://f%C3%B6%C3%B6:b%C3%B6r@l%C3%B6calhost:8080/far'
		);
	});

	test('correctFileUriToFilePath2', () => {

		const test = (input: string, expected: string) => {
			const value = URI.parse(input);
			assert.equal(value.fsPath, expected, 'Result for ' + input);
			const value2 = URI.file(value.fsPath);
			assert.equal(value2.fsPath, expected, 'Result for ' + input);
			assert.equal(value.toString(), value2.toString());
		};

		test('file:///c:/alex.txt', isWindows ? 'c:\\alex.txt' : 'c:/alex.txt');
		test('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins', isWindows ? 'c:\\Source\\Zürich or Zurich (ˈzjʊərɪk,\\Code\\resources\\app\\plugins' : 'c:/Source/Zürich or Zurich (ˈzjʊərɪk,/Code/resources/app/plugins');
		test('file://monacotools/folder/isi.txt', isWindows ? '\\\\monacotools\\folder\\isi.txt' : '//monacotools/folder/isi.txt');
		test('file://monacotools1/certificates/SSL/', isWindows ? '\\\\monacotools1\\certificates\\SSL\\' : '//monacotools1/certificates/SSL/');
	});

	test('URI - http, query & toString', function () {

		let uri = URI.parse('https://go.microsoft.com/fwlink/?LinkId=518008');
		assert.equal(uri.query, 'LinkId=518008');
		assert.equal(uri.toString(true), 'https://go.microsoft.com/fwlink/?LinkId=518008');
		assert.equal(uri.toString(), 'https://go.microsoft.com/fwlink/?LinkId=518008');

		let uri2 = URI.parse(uri.toString());
		assert.equal(uri2.query, 'LinkId=518008');
		assert.equal(uri2.query, uri.query);

		uri = URI.parse('https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.query, 'LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.toString(true), 'https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.equal(uri.toString(), 'https://go.microsoft.com/fwlink/?LinkId=518008&fo%C3%B6&k%C3%A9%C2%A5=%C3%BC%C3%BC');

		uri2 = URI.parse(uri.toString());
		assert.equal(uri2.query, 'LinkId=518008&foö&ké¥=üü');
		assert.equal(uri2.query, uri.query);

		// #24849
		uri = URI.parse('https://twitter.com/search?src=typd&q=%23tag');
		assert.equal(uri.toString(true), 'https://twitter.com/search?src=typd&q=%23tag');
	});


	test('class URI cannot represent relative file paths #34449', function () {

		let path = '/foo/bar';
		assert.equal(URI.file(path).path, path);
		path = 'foo/bar';
		assert.equal(URI.file(path).path, '/foo/bar');
		path = './foo/bar';
		assert.equal(URI.file(path).path, '/./foo/bar'); // todo@joh missing normalization

		const fileUri1 = URI.parse(`file:foo/bar`);
		assert.equal(fileUri1.path, '/foo/bar');
		assert.equal(fileUri1.authority, '');
		const uri = fileUri1.toString();
		assert.equal(uri, 'file:///foo/bar');
		const fileUri2 = URI.parse(uri);
		assert.equal(fileUri2.path, '/foo/bar');
		assert.equal(fileUri2.authority, '');
	});

	test('Ctrl click to follow hash query param url gets urlencoded #49628', function () {
		let input = 'http://localhost:3000/#/foo?bar=baz';
		let uri = URI.parse(input);
		assert.equal(uri.toString(true), input);

		input = 'http://localhost:3000/foo?bar=baz';
		uri = URI.parse(input);
		assert.equal(uri.toString(true), input);
	});

	test('Unable to open \'%A0.txt\': URI malformed #76506', function () {
		let uriFromPath = URI.file('/foo/%A0.txt');
		let uriFromStr = URI.parse(uriFromPath.toString());
		assert.equal(uriFromPath.scheme, uriFromStr.scheme);
		assert.equal(uriFromPath.path, uriFromStr.path);
		assert.equal(uriFromPath.toString(), 'file:///foo/%25A0.txt');
		assert.equal(uriFromStr.toString(), 'file:///foo/%25A0.txt');
	});

	test('Unable to open \'%2e.txt\'', function () {
		let uriFromPath = URI.file('/foo/%2e.txt');
		let uriFromStr = URI.parse(uriFromPath.toString());
		assert.equal(uriFromPath.scheme, uriFromStr.scheme);
		assert.equal(uriFromPath.path, uriFromStr.path);
		assert.equal(uriFromPath.toString(), 'file:///foo/%252e.txt');
		assert.equal(uriFromStr.toString(), 'file:///foo/%252e.txt');
	});

	test('Links in markdown are broken if url contains encoded parameters #79474', function () {
		let strIn = 'https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom';
		let uri1 = URI.parse(strIn);
		assertToString(uri1, strIn);
		let strOut = uri1.toString();
		let uri2 = URI.parse(strOut);
		assertEqualUri(uri1, uri2);
		assert.equal(strIn, strOut);
	});

	test('Uri#parse can break path-component #45515', function () {
		let strIn = 'https://firebasestorage.googleapis.com/v0/b/brewlangerie.appspot.com/o/products%2FzVNZkudXJyq8bPGTXUxx%2FBetterave-Sesame.jpg?alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437';
		let uri1 = URI.parse(strIn);
		assertToString(uri1, strIn);

		assertComponents(uri1,
			'https',
			'firebasestorage.googleapis.com',
			'/v0/b/brewlangerie.appspot.com/o/products/zVNZkudXJyq8bPGTXUxx/Betterave-Sesame.jpg', // INCORRECT: %2F got decoded but for compat reasons we cannot change this anymore...
			'alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437',
			''
		);

		let strOut = uri1.toString();
		let uri2 = URI.parse(strOut);
		assertEqualUri(uri1, uri2);
	});

	test('Nonce does not match on login #75755', function () {
		let uri = URI.parse('http://localhost:60371/signin?nonce=iiK1zRI%2BHyDCKb2zatvrYA%3D%3D');
		assertComponents(uri, 'http', 'localhost:60371', '/signin', 'nonce=iiK1zRI+HyDCKb2zatvrYA==', '');
		assertToString(uri, 'http://localhost:60371/signin?nonce=iiK1zRI%2BHyDCKb2zatvrYA%3D%3D');
	});

	test('URI.parse() failes with `Cannot read property \'toLowerCase\' of undefined` #75344', function () {
		try {
			URI.parse('abc');
			assert.ok(false);
		} catch (e) {
			assert.ok(e instanceof Error && e.message.indexOf('[UriError]:'));
		}
	});

	test('vscode.Uri.parse is double encoding certain characters', function () {
		const inStr = 'https://github.com/PowerShell/vscode-powershell#reporting-problems';
		assertToString(inStr, inStr);
		assertComponents(inStr, 'https', 'github.com', '/PowerShell/vscode-powershell', '', 'reporting-problems');
	});

	test('Symbols in URL fragment should not be encoded #76635', function () {
		const inStr = 'http://source.roslyn.io/#Microsoft.CodeAnalysis.CSharp/CSharpCompilationOptions.cs,20';
		assertToString(inStr, inStr);
		assertComponents(inStr, 'http', 'source.roslyn.io', '/', '', 'Microsoft.CodeAnalysis.CSharp/CSharpCompilationOptions.cs,20');
	});

	test('vscode.env.openExternal is not working correctly because of unnecessary escape processing. #76606', function () {
		const inStr = 'x-github-client://openRepo/https://github.com/wraith13/open-in-github-desktop-vscode.git';
		assertToString(inStr, 'x-github-client://openrepo/https://github.com/wraith13/open-in-github-desktop-vscode.git'); // lower-cased authory
		assertComponents(inStr, 'x-github-client', 'openRepo', '/https://github.com/wraith13/open-in-github-desktop-vscode.git', '', '');
	});

	test('When I click on a link in the terminal, browser opens with a URL which seems to be the link, but run through decodeURIComponent #52211', function () {
		const inStr = 'http://localhost:8448/#/repository?path=%2Fhome%2Fcapaj%2Fgit_projects%2Fartillery';
		assertToString(inStr, inStr);
		assertComponents(inStr, 'http', 'localhost:8448', '/', '', '/repository?path=/home/capaj/git_projects/artillery'); // INCORRECT %2F lost
	});

	test('Terminal breaks weblink for fish shell #44278', function () {
		const inStr = 'https://eu-west-1.console.aws.amazon.com/cloudformation/home\\?region=eu-west-1#/stacks\\?filter=active';
		assertToString(inStr, inStr);
		assertComponents(inStr, 'https', 'eu-west-1.console.aws.amazon.com', '/cloudformation/home\\', 'region=eu-west-1', '/stacks\\?filter=active');
	});

	test('Markdown mode cannot open links that contains some codes by percent-encoding. #32026', function () {
		const inStr = 'https://www.google.co.jp/search?q=%91%E5';
		assertToString(inStr, inStr);
		assertComponents(inStr, 'https', 'www.google.co.jp', '/search', 'q=%91%E5', '');
	});

	test('URI#parse creates normalized output', function () {
		function assertToString(input: string, output: string = input): void {
			const uri = URI.parse(input);
			assert.equal(uri.toString(), output);
		}

		// don't break query string, encoded characters
		assertToString('https://firebasestorage.googleapis.com/v0/b/brewlangerie.appspot.com/o/products%2FzVNZkudXJyq8bPGTXUxx%2FBetterave-Sesame.jpg?alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437');
		assertToString('https://go.microsoft.com/fwlink/?LinkId=518008');
		assertToString('https://twitter.com/search?src=typd&q=%23tag');
		assertToString('http://localhost:3000/#/foo?bar=baz');
		assertToString('https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom');
		assertToString('https://myhost.com/Redirect?url=http%3a%2f%2Fwww.bing.com%3Fsearch%3Dtom', 'https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom'); // upper-case hex
		assertToString('https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü', 'https://go.microsoft.com/fwlink/?LinkId=518008&fo%C3%B6&k%C3%A9%C2%A5=%C3%BC%C3%BC'); // encode umlaute and friends

		// normalize things like
		assertToString('file:///c:/test/me', 'file:///c%3A/test/me'); // drive letter treatment
		assertToString('file:///C:/test/me', 'file:///c%3A/test/me');
		assertToString('file:///c%3A/test/me', 'file:///c%3A/test/me');
		assertToString('file:///C%3A/test/me', 'file:///c%3A/test/me');
	});

	test('URI - (de)serialize', function () {

		const values = [
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
			let data = value.toJSON() as UriComponents;
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

	// ------ check against standard URL and nodejs-file-url utils

	function assertUriFromFsPath(path: string, recurse = true): void {
		let actual = URI.file(path).toString();
		if (isWindows) {
			// we always encode windows drive letters and since nodejs
			// never does. to compare we need to undo our encoding...
			actual = actual.replace(/(\/[a-z])%3A/, '$1:');
		}
		let expected = pathToFileURL(path).href;
		assert.equal(actual, expected, path);
		if (recurse) {
			assertFsPathFromUri(expected, false);
		}
	}

	function assertFsPathFromUri(uri: string, recurse = true): void {
		let actual = URI.parse(uri).fsPath;
		let expected = fileURLToPath(uri);
		assert.equal(actual, expected, uri);
		if (recurse) {
			assertUriFromFsPath(actual, false);
		}
	}

	test('URI.file and pathToFileURL', function () {
		// nodejs is strict to the platform on which it runs
		if (isWindows) {
			assertUriFromFsPath('d:/foo/bar');
			assertUriFromFsPath('d:/foo/%2e.txt');
			assertUriFromFsPath('d:/foo/%A0.txt');
			assertUriFromFsPath('d:/foo/ü.txt');
			assertUriFromFsPath('d:/foo/ß.txt');
			assertUriFromFsPath('d:/my/c#project/d.cs');
			assertUriFromFsPath('c:\\win\\path');
			assertUriFromFsPath('c:\\test\\drive');
			assertUriFromFsPath('c:\\test with %\\path');
			assertUriFromFsPath('c:\\test with %25\\path');
			assertUriFromFsPath('c:\\test with %25\\c#code');
			// assertUriFromFsPath('\\\\shäres\\path\\c#\\plugin.json'); // nodejs doesn't accept UNC paths as paths
			// assertUriFromFsPath('\\\\localhost\\c$\\GitDevelopment\\express');
			// assertUriFromFsPath('\\\\shares');
			// assertUriFromFsPath('\\\\shares\\');
		} else {
			assertUriFromFsPath('/foo/bar');
			assertUriFromFsPath('/foo/%2e.txt');
			assertUriFromFsPath('/foo/%A0.txt');
			assertUriFromFsPath('/foo/ü.txt');
			assertUriFromFsPath('/foo/ß.txt');
			assertUriFromFsPath('/my/c#project/d.cs');
			assertUriFromFsPath('/c\\win\\path');
		}
	});


	test('URI.fsPath and fileURLToPath', function () {
		// nodejs is strict to the platform on which it runs
		if (isWindows) {
			assertFsPathFromUri('file:///f:/foo/bar');
			assertFsPathFromUri('file:///f:/fo%25/bar');
			assertFsPathFromUri('file:///f:/foo/b ar/text.cs');
			assertFsPathFromUri('file:///f:/foö/bar');
			assertFsPathFromUri('file:///f:/fo%C3%B6/bar');
			assertFsPathFromUri('file:///f:/');
			assertFsPathFromUri('file:///f:/my/c%23project/c.cs');
			assertFsPathFromUri('file:///c:/bar/foo');
			assertFsPathFromUri('file:///c:/alex.txt');
			assertFsPathFromUri('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins');
			assertFsPathFromUri('file://unc-host/foö/bar', false);
			// assertFsPathFromUri('file://unc-host/', false); //nodejs \\unc-host\ vs code \
			assertFsPathFromUri('file://monacotools/folder/isi.txt', false);
			assertFsPathFromUri('file://monacotools1/certificates/SSL/', false);
		} else {
			assertFsPathFromUri('file:///foo/bar');
			assertFsPathFromUri('file:///fo%25/bar');
			assertFsPathFromUri('file:///foo/b ar/text.cs');
			assertFsPathFromUri('file:///foö/bar');
			assertFsPathFromUri('file:///fo%C3%B6/bar');
			assertFsPathFromUri('file:///');
			assertFsPathFromUri('file:///my/c%23project/c.cs');
			assertFsPathFromUri('file:///foo%5cbar');
			assertFsPathFromUri('file:///foo%5Cbar');
			assertFsPathFromUri('file:///foo%5C%5cbar');
			assertFsPathFromUri('file:///Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins');
		}
	});

	// ---- check against standard url
	test('URI.toString equals (whatwg) URL.toString', function () {

		function assertToString(uri: string): void {
			const actual = URI.parse(uri).toString();
			const expected = new URL(uri).href;
			assert.equal(actual, expected);
		}

		assertToString('before:some/file/path');
		assertToString('scheme://authority/path');
		assertToString('scheme:/path');
		assertToString('foo:bar/path');
		// assertToString('http:/api/files/test.me?t=1234'); // URL makes api the hostname,
		assertToString('http://api/files/test.me?t=1234');
		// assertToString('file:///c:/test/me'); // we encode the colon
		// assertToString('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins/c%23/plugin.json');
		// assertToString('file:///c:/test %25/path');
		assertToString('file://shares/files/c%23/p.cs');
		assertToString('inmemory:');
		assertToString('foo:api/files/test');
		assertToString('f3ile:?q');
		assertToString('f3ile:#d');
		assertToString('foo+bar:path');
		assertToString('foo-bar:path');
		assertToString('foo.bar:path');
		assertToString('file:///_:/path');
		assertToString('https://firebasestorage.googleapis.com/v0/b/brewlangerie.appspot.com/o/products%2FzVNZkudXJyq8bPGTXUxx%2FBetterave-Sesame.jpg?alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437');
		assertToString('https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom');
		assertToString('debug:internalModule.js?session=aDebugSessionId&ref=11');
		assertToString('debug:internalModule.js?session%3DaDebugSessionId%26ref%3D11');
		assertToString('https://github.com/microsoft/vscode/issues/33746#issuecomment-545345356');
		assertToString('http://localhost:3000/#/foo?bar=baz');
		assertToString('https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom');
		assertToString('https://myhost.com/my/pãth/ìß/hē®ę');
		assertToString('http://foo:bar@localhost/far');
		assertToString('http://foo@localhost/far');
		assertToString('http://foo:bAr@localhost:8080/far');
		assertToString('http://foo@localhost:8080/far');
		assertToString('http://localhost:60371/signin?nonce=iiK1zRI%2BHyDCKb2zatvrYA%3D%3D');
		assertToString('https://github.com/PowerShell/vscode-powershell#reporting-problems');
		assertToString('http://source.roslyn.io/#Microsoft.CodeAnalysis.CSharp/CSharpCompilationOptions.cs,20');
		// assertToString('x-github-client://openRepo/https://github.com/wraith13/open-in-github-desktop-vscode.git'); we lower-case
		assertToString('x-github-client://openrepo/https://github.com/wraith13/open-in-github-desktop-vscode.git');
		assertToString('http://www.google.com/?parameter1=\'http://imageserver.domain.com/?parameter2=1\'');
		assertToString('http://some.ws/page?id=123&select=%22quoted_string%22');
		// assertToString('https://eu-west-1.console.aws.amazon.com/cloudformation/home\\?region=eu-west-1#/stacks\\?filter=active'); URL makes slash out of backslash
		assertToString('http://localhost/?user=test%2B1@example.com');
		assertToString('https://www.google.co.jp/search?q=%91%E5');
	});
});
