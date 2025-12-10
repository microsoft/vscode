/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isWindows } from '../../common/platform.js';
import { URI, UriComponents, isUriComponents } from '../../common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';


suite('URI', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('file#toString', () => {
		assert.strictEqual(URI.file('c:/win/path').toString(), 'file:///c%3A/win/path');
		assert.strictEqual(URI.file('C:/win/path').toString(), 'file:///c%3A/win/path');
		assert.strictEqual(URI.file('c:/win/path/').toString(), 'file:///c%3A/win/path/');
		assert.strictEqual(URI.file('/c:/win/path').toString(), 'file:///c%3A/win/path');
	});

	test('URI.file (win-special)', () => {
		if (isWindows) {
			assert.strictEqual(URI.file('c:\\win\\path').toString(), 'file:///c%3A/win/path');
			assert.strictEqual(URI.file('c:\\win/path').toString(), 'file:///c%3A/win/path');
		} else {
			assert.strictEqual(URI.file('c:\\win\\path').toString(), 'file:///c%3A%5Cwin%5Cpath');
			assert.strictEqual(URI.file('c:\\win/path').toString(), 'file:///c%3A%5Cwin/path');

		}
	});

	test('file#fsPath (win-special)', () => {
		if (isWindows) {
			assert.strictEqual(URI.file('c:\\win\\path').fsPath, 'c:\\win\\path');
			assert.strictEqual(URI.file('c:\\win/path').fsPath, 'c:\\win\\path');

			assert.strictEqual(URI.file('c:/win/path').fsPath, 'c:\\win\\path');
			assert.strictEqual(URI.file('c:/win/path/').fsPath, 'c:\\win\\path\\');
			assert.strictEqual(URI.file('C:/win/path').fsPath, 'c:\\win\\path');
			assert.strictEqual(URI.file('/c:/win/path').fsPath, 'c:\\win\\path');
			assert.strictEqual(URI.file('./c/win/path').fsPath, '\\.\\c\\win\\path');
		} else {
			assert.strictEqual(URI.file('c:/win/path').fsPath, 'c:/win/path');
			assert.strictEqual(URI.file('c:/win/path/').fsPath, 'c:/win/path/');
			assert.strictEqual(URI.file('C:/win/path').fsPath, 'c:/win/path');
			assert.strictEqual(URI.file('/c:/win/path').fsPath, 'c:/win/path');
			assert.strictEqual(URI.file('./c/win/path').fsPath, '/./c/win/path');
		}
	});

	test('URI#fsPath - no `fsPath` when no `path`', () => {
		const value = URI.parse('file://%2Fhome%2Fticino%2Fdesktop%2Fcpluscplus%2Ftest.cpp');
		assert.strictEqual(value.authority, '/home/ticino/desktop/cpluscplus/test.cpp');
		assert.strictEqual(value.path, '/');
		if (isWindows) {
			assert.strictEqual(value.fsPath, '\\');
		} else {
			assert.strictEqual(value.fsPath, '/');
		}
	});

	test('http#toString', () => {
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'www.example.com', path: '/my/path' }).toString(), 'http://www.example.com/my/path');
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'www.example.com', path: '/my/path' }).toString(), 'http://www.example.com/my/path');
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'www.EXAMPLE.com', path: '/my/path' }).toString(), 'http://www.example.com/my/path');
		assert.strictEqual(URI.from({ scheme: 'http', authority: '', path: 'my/path' }).toString(), 'http:/my/path');
		assert.strictEqual(URI.from({ scheme: 'http', authority: '', path: '/my/path' }).toString(), 'http:/my/path');
		//http://example.com/#test=true
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'example.com', path: '/', query: 'test=true' }).toString(), 'http://example.com/?test%3Dtrue');
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'example.com', path: '/', query: '', fragment: 'test=true' }).toString(), 'http://example.com/#test%3Dtrue');
	});

	test('http#toString, encode=FALSE', () => {
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'example.com', path: '/', query: 'test=true' }).toString(true), 'http://example.com/?test=true');
		assert.strictEqual(URI.from({ scheme: 'http', authority: 'example.com', path: '/', query: '', fragment: 'test=true' }).toString(true), 'http://example.com/#test=true');
		assert.strictEqual(URI.from({ scheme: 'http', path: '/api/files/test.me', query: 't=1234' }).toString(true), 'http:/api/files/test.me?t=1234');

		const value = URI.parse('file://shares/pröjects/c%23/#l12');
		assert.strictEqual(value.authority, 'shares');
		assert.strictEqual(value.path, '/pröjects/c#/');
		assert.strictEqual(value.fragment, 'l12');
		assert.strictEqual(value.toString(), 'file://shares/pr%C3%B6jects/c%23/#l12');
		assert.strictEqual(value.toString(true), 'file://shares/pröjects/c%23/#l12');

		const uri2 = URI.parse(value.toString(true));
		const uri3 = URI.parse(value.toString());
		assert.strictEqual(uri2.authority, uri3.authority);
		assert.strictEqual(uri2.path, uri3.path);
		assert.strictEqual(uri2.query, uri3.query);
		assert.strictEqual(uri2.fragment, uri3.fragment);
	});

	test('with, identity', () => {
		const uri = URI.parse('foo:bar/path');

		let uri2 = uri.with(null!);
		assert.ok(uri === uri2);
		uri2 = uri.with(undefined!);
		assert.ok(uri === uri2);
		uri2 = uri.with({});
		assert.ok(uri === uri2);
		uri2 = uri.with({ scheme: 'foo', path: 'bar/path' });
		assert.ok(uri === uri2);
	});

	test('with, changes', () => {
		assert.strictEqual(URI.parse('before:some/file/path').with({ scheme: 'after' }).toString(), 'after:some/file/path');
		assert.strictEqual(URI.from({ scheme: 's' }).with({ scheme: 'http', path: '/api/files/test.me', query: 't=1234' }).toString(), 'http:/api/files/test.me?t%3D1234');
		assert.strictEqual(URI.from({ scheme: 's' }).with({ scheme: 'http', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'http:/api/files/test.me?t%3D1234');
		assert.strictEqual(URI.from({ scheme: 's' }).with({ scheme: 'https', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'https:/api/files/test.me?t%3D1234');
		assert.strictEqual(URI.from({ scheme: 's' }).with({ scheme: 'HTTP', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'HTTP:/api/files/test.me?t%3D1234');
		assert.strictEqual(URI.from({ scheme: 's' }).with({ scheme: 'HTTPS', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'HTTPS:/api/files/test.me?t%3D1234');
		assert.strictEqual(URI.from({ scheme: 's' }).with({ scheme: 'boo', authority: '', path: '/api/files/test.me', query: 't=1234', fragment: '' }).toString(), 'boo:/api/files/test.me?t%3D1234');
	});

	test('with, remove components #8465', () => {
		assert.strictEqual(URI.parse('scheme://authority/path').with({ authority: '' }).toString(), 'scheme:/path');
		assert.strictEqual(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ authority: '' }).toString(), 'scheme:/path');
		assert.strictEqual(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ authority: null }).toString(), 'scheme:/path');
		assert.strictEqual(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ path: '' }).toString(), 'scheme://authority');
		assert.strictEqual(URI.parse('scheme:/path').with({ authority: 'authority' }).with({ path: null }).toString(), 'scheme://authority');
		assert.strictEqual(URI.parse('scheme:/path').with({ authority: '' }).toString(), 'scheme:/path');
		assert.strictEqual(URI.parse('scheme:/path').with({ authority: null }).toString(), 'scheme:/path');
	});

	test('with, validation', () => {
		const uri = URI.parse('foo:bar/path');
		assert.throws(() => uri.with({ scheme: 'fai:l' }));
		assert.throws(() => uri.with({ scheme: 'fäil' }));
		assert.throws(() => uri.with({ authority: 'fail' }));
		assert.throws(() => uri.with({ path: '//fail' }));
	});

	test('parse', () => {
		let value = URI.parse('http:/api/files/test.me?t=1234');
		assert.strictEqual(value.scheme, 'http');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/api/files/test.me');
		assert.strictEqual(value.query, 't=1234');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('http://api/files/test.me?t=1234');
		assert.strictEqual(value.scheme, 'http');
		assert.strictEqual(value.authority, 'api');
		assert.strictEqual(value.path, '/files/test.me');
		assert.strictEqual(value.query, 't=1234');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('file:///c:/test/me');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/c:/test/me');
		assert.strictEqual(value.fragment, '');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fsPath, isWindows ? 'c:\\test\\me' : 'c:/test/me');

		value = URI.parse('file://shares/files/c%23/p.cs');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, 'shares');
		assert.strictEqual(value.path, '/files/c#/p.cs');
		assert.strictEqual(value.fragment, '');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fsPath, isWindows ? '\\\\shares\\files\\c#\\p.cs' : '//shares/files/c#/p.cs');

		value = URI.parse('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins/c%23/plugin.json');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/c:/Source/Zürich or Zurich (ˈzjʊərɪk,/Code/resources/app/plugins/c#/plugin.json');
		assert.strictEqual(value.fragment, '');
		assert.strictEqual(value.query, '');

		value = URI.parse('file:///c:/test %25/path');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/c:/test %/path');
		assert.strictEqual(value.fragment, '');
		assert.strictEqual(value.query, '');

		value = URI.parse('inmemory:');
		assert.strictEqual(value.scheme, 'inmemory');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('foo:api/files/test');
		assert.strictEqual(value.scheme, 'foo');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, 'api/files/test');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('file:?q');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/');
		assert.strictEqual(value.query, 'q');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('file:#d');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, 'd');

		value = URI.parse('f3ile:#d');
		assert.strictEqual(value.scheme, 'f3ile');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, 'd');

		value = URI.parse('foo+bar:path');
		assert.strictEqual(value.scheme, 'foo+bar');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, 'path');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('foo-bar:path');
		assert.strictEqual(value.scheme, 'foo-bar');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, 'path');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, '');

		value = URI.parse('foo.bar:path');
		assert.strictEqual(value.scheme, 'foo.bar');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, 'path');
		assert.strictEqual(value.query, '');
		assert.strictEqual(value.fragment, '');
	});

	test('parse, disallow //path when no authority', () => {
		assert.throws(() => URI.parse('file:////shares/files/p.cs'));
	});

	test('URI#file, win-speciale', () => {
		if (isWindows) {
			let value = URI.file('c:\\test\\drive');
			assert.strictEqual(value.path, '/c:/test/drive');
			assert.strictEqual(value.toString(), 'file:///c%3A/test/drive');

			value = URI.file('\\\\shäres\\path\\c#\\plugin.json');
			assert.strictEqual(value.scheme, 'file');
			assert.strictEqual(value.authority, 'shäres');
			assert.strictEqual(value.path, '/path/c#/plugin.json');
			assert.strictEqual(value.fragment, '');
			assert.strictEqual(value.query, '');
			assert.strictEqual(value.toString(), 'file://sh%C3%A4res/path/c%23/plugin.json');

			value = URI.file('\\\\localhost\\c$\\GitDevelopment\\express');
			assert.strictEqual(value.scheme, 'file');
			assert.strictEqual(value.path, '/c$/GitDevelopment/express');
			assert.strictEqual(value.fsPath, '\\\\localhost\\c$\\GitDevelopment\\express');
			assert.strictEqual(value.query, '');
			assert.strictEqual(value.fragment, '');
			assert.strictEqual(value.toString(), 'file://localhost/c%24/GitDevelopment/express');

			value = URI.file('c:\\test with %\\path');
			assert.strictEqual(value.path, '/c:/test with %/path');
			assert.strictEqual(value.toString(), 'file:///c%3A/test%20with%20%25/path');

			value = URI.file('c:\\test with %25\\path');
			assert.strictEqual(value.path, '/c:/test with %25/path');
			assert.strictEqual(value.toString(), 'file:///c%3A/test%20with%20%2525/path');

			value = URI.file('c:\\test with %25\\c#code');
			assert.strictEqual(value.path, '/c:/test with %25/c#code');
			assert.strictEqual(value.toString(), 'file:///c%3A/test%20with%20%2525/c%23code');

			value = URI.file('\\\\shares');
			assert.strictEqual(value.scheme, 'file');
			assert.strictEqual(value.authority, 'shares');
			assert.strictEqual(value.path, '/'); // slash is always there

			value = URI.file('\\\\shares\\');
			assert.strictEqual(value.scheme, 'file');
			assert.strictEqual(value.authority, 'shares');
			assert.strictEqual(value.path, '/');
		}
	});

	test('VSCode URI module\'s driveLetterPath regex is incorrect, #32961', function () {
		const uri = URI.parse('file:///_:/path');
		assert.strictEqual(uri.fsPath, isWindows ? '\\_:\\path' : '/_:/path');
	});

	test('URI#file, no path-is-uri check', () => {

		// we don't complain here
		const value = URI.file('file://path/to/file');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/file://path/to/file');
	});

	test('URI#file, always slash', () => {

		let value = URI.file('a.file');
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/a.file');
		assert.strictEqual(value.toString(), 'file:///a.file');

		value = URI.parse(value.toString());
		assert.strictEqual(value.scheme, 'file');
		assert.strictEqual(value.authority, '');
		assert.strictEqual(value.path, '/a.file');
		assert.strictEqual(value.toString(), 'file:///a.file');
	});

	test('URI.toString, only scheme and query', () => {
		const value = URI.parse('stuff:?qüery');
		assert.strictEqual(value.toString(), 'stuff:?q%C3%BCery');
	});

	test('URI#toString, upper-case percent espaces', () => {
		const value = URI.parse('file://sh%c3%a4res/path');
		assert.strictEqual(value.toString(), 'file://sh%C3%A4res/path');
	});

	test('URI#toString, lower-case windows drive letter', () => {
		assert.strictEqual(URI.parse('untitled:c:/Users/jrieken/Code/abc.txt').toString(), 'untitled:c%3A/Users/jrieken/Code/abc.txt');
		assert.strictEqual(URI.parse('untitled:C:/Users/jrieken/Code/abc.txt').toString(), 'untitled:c%3A/Users/jrieken/Code/abc.txt');
	});

	test('URI#toString, escape all the bits', () => {

		const value = URI.file('/Users/jrieken/Code/_samples/18500/Mödel + Other Thîngß/model.js');
		assert.strictEqual(value.toString(), 'file:///Users/jrieken/Code/_samples/18500/M%C3%B6del%20%2B%20Other%20Th%C3%AEng%C3%9F/model.js');
	});

	test('URI#toString, don\'t encode port', () => {
		let value = URI.parse('http://localhost:8080/far');
		assert.strictEqual(value.toString(), 'http://localhost:8080/far');

		value = URI.from({ scheme: 'http', authority: 'löcalhost:8080', path: '/far', query: undefined, fragment: undefined });
		assert.strictEqual(value.toString(), 'http://l%C3%B6calhost:8080/far');
	});

	test('URI#toString, user information in authority', () => {
		let value = URI.parse('http://foo:bar@localhost/far');
		assert.strictEqual(value.toString(), 'http://foo:bar@localhost/far');

		value = URI.parse('http://foo@localhost/far');
		assert.strictEqual(value.toString(), 'http://foo@localhost/far');

		value = URI.parse('http://foo:bAr@localhost:8080/far');
		assert.strictEqual(value.toString(), 'http://foo:bAr@localhost:8080/far');

		value = URI.parse('http://foo@localhost:8080/far');
		assert.strictEqual(value.toString(), 'http://foo@localhost:8080/far');

		value = URI.from({ scheme: 'http', authority: 'föö:bör@löcalhost:8080', path: '/far', query: undefined, fragment: undefined });
		assert.strictEqual(value.toString(), 'http://f%C3%B6%C3%B6:b%C3%B6r@l%C3%B6calhost:8080/far');
	});

	test('correctFileUriToFilePath2', () => {

		const test = (input: string, expected: string) => {
			const value = URI.parse(input);
			assert.strictEqual(value.fsPath, expected, 'Result for ' + input);
			const value2 = URI.file(value.fsPath);
			assert.strictEqual(value2.fsPath, expected, 'Result for ' + input);
			assert.strictEqual(value.toString(), value2.toString());
		};

		test('file:///c:/alex.txt', isWindows ? 'c:\\alex.txt' : 'c:/alex.txt');
		test('file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins', isWindows ? 'c:\\Source\\Zürich or Zurich (ˈzjʊərɪk,\\Code\\resources\\app\\plugins' : 'c:/Source/Zürich or Zurich (ˈzjʊərɪk,/Code/resources/app/plugins');
		test('file://monacotools/folder/isi.txt', isWindows ? '\\\\monacotools\\folder\\isi.txt' : '//monacotools/folder/isi.txt');
		test('file://monacotools1/certificates/SSL/', isWindows ? '\\\\monacotools1\\certificates\\SSL\\' : '//monacotools1/certificates/SSL/');
	});

	test('URI - http, query & toString', function () {

		let uri = URI.parse('https://go.microsoft.com/fwlink/?LinkId=518008');
		assert.strictEqual(uri.query, 'LinkId=518008');
		assert.strictEqual(uri.toString(true), 'https://go.microsoft.com/fwlink/?LinkId=518008');
		assert.strictEqual(uri.toString(), 'https://go.microsoft.com/fwlink/?LinkId%3D518008');

		let uri2 = URI.parse(uri.toString());
		assert.strictEqual(uri2.query, 'LinkId=518008');
		assert.strictEqual(uri2.query, uri.query);

		uri = URI.parse('https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.strictEqual(uri.query, 'LinkId=518008&foö&ké¥=üü');
		assert.strictEqual(uri.toString(true), 'https://go.microsoft.com/fwlink/?LinkId=518008&foö&ké¥=üü');
		assert.strictEqual(uri.toString(), 'https://go.microsoft.com/fwlink/?LinkId%3D518008%26fo%C3%B6%26k%C3%A9%C2%A5%3D%C3%BC%C3%BC');

		uri2 = URI.parse(uri.toString());
		assert.strictEqual(uri2.query, 'LinkId=518008&foö&ké¥=üü');
		assert.strictEqual(uri2.query, uri.query);

		// #24849
		uri = URI.parse('https://twitter.com/search?src=typd&q=%23tag');
		assert.strictEqual(uri.toString(true), 'https://twitter.com/search?src=typd&q=%23tag');
	});


	test('class URI cannot represent relative file paths #34449', function () {

		let path = '/foo/bar';
		assert.strictEqual(URI.file(path).path, path);
		path = 'foo/bar';
		assert.strictEqual(URI.file(path).path, '/foo/bar');
		path = './foo/bar';
		assert.strictEqual(URI.file(path).path, '/./foo/bar'); // missing normalization

		const fileUri1 = URI.parse(`file:foo/bar`);
		assert.strictEqual(fileUri1.path, '/foo/bar');
		assert.strictEqual(fileUri1.authority, '');
		const uri = fileUri1.toString();
		assert.strictEqual(uri, 'file:///foo/bar');
		const fileUri2 = URI.parse(uri);
		assert.strictEqual(fileUri2.path, '/foo/bar');
		assert.strictEqual(fileUri2.authority, '');
	});

	test('Ctrl click to follow hash query param url gets urlencoded #49628', function () {
		let input = 'http://localhost:3000/#/foo?bar=baz';
		let uri = URI.parse(input);
		assert.strictEqual(uri.toString(true), input);

		input = 'http://localhost:3000/foo?bar=baz';
		uri = URI.parse(input);
		assert.strictEqual(uri.toString(true), input);
	});

	test('Unable to open \'%A0.txt\': URI malformed #76506', function () {

		let uri = URI.file('/foo/%A0.txt');
		let uri2 = URI.parse(uri.toString());
		assert.strictEqual(uri.scheme, uri2.scheme);
		assert.strictEqual(uri.path, uri2.path);

		uri = URI.file('/foo/%2e.txt');
		uri2 = URI.parse(uri.toString());
		assert.strictEqual(uri.scheme, uri2.scheme);
		assert.strictEqual(uri.path, uri2.path);
	});

	test('Bug in URI.isUri() that fails `thing` type comparison #114971', function () {
		const uri = URI.file('/foo/bazz.txt');
		assert.strictEqual(URI.isUri(uri), true);
		assert.strictEqual(URI.isUri(uri.toJSON()), false);

		// fsPath -> getter
		assert.strictEqual(URI.isUri({
			scheme: 'file',
			authority: '',
			path: '/foo/bazz.txt',
			get fsPath() { return '/foo/bazz.txt'; },
			query: '',
			fragment: '',
			with() { return this; },
			toString() { return ''; }
		}), true);

		// fsPath -> property
		assert.strictEqual(URI.isUri({
			scheme: 'file',
			authority: '',
			path: '/foo/bazz.txt',
			fsPath: '/foo/bazz.txt',
			query: '',
			fragment: '',
			with() { return this; },
			toString() { return ''; }
		}), true);

		assert.strictEqual(URI.isUri(1), false);
		assert.strictEqual(URI.isUri('1'), false);
		assert.strictEqual(URI.isUri('http://sample.com'), false);
		assert.strictEqual(URI.isUri(null), false);
		assert.strictEqual(URI.isUri(undefined), false);
	});

	test('isUriComponents', function () {

		assert.ok(isUriComponents(URI.file('a')));
		assert.ok(isUriComponents(URI.file('a').toJSON()));
		assert.ok(isUriComponents(URI.file('')));
		assert.ok(isUriComponents(URI.file('').toJSON()));

		assert.strictEqual(isUriComponents(1), false);
		assert.strictEqual(isUriComponents(true), false);
		assert.strictEqual(isUriComponents('true'), false);
		assert.strictEqual(isUriComponents({}), false);
		assert.strictEqual(isUriComponents({ scheme: '' }), true); // valid components but INVALID uri
		assert.strictEqual(isUriComponents({ scheme: 'fo' }), true);
		assert.strictEqual(isUriComponents({ scheme: 'fo', path: '/p' }), true);
		assert.strictEqual(isUriComponents({ path: '/p' }), false);
	});

	test('from, from(strict), revive', function () {

		assert.throws(() => URI.from({ scheme: '' }, true));
		assert.strictEqual(URI.from({ scheme: '' }).scheme, 'file');
		assert.strictEqual(URI.revive({ scheme: '' }).scheme, '');
	});

	test('Unable to open \'%A0.txt\': URI malformed #76506, part 2', function () {
		assert.strictEqual(URI.parse('file://some/%.txt').toString(), 'file://some/%25.txt');
		assert.strictEqual(URI.parse('file://some/%A0.txt').toString(), 'file://some/%25A0.txt');
	});

	test.skip('Links in markdown are broken if url contains encoded parameters #79474', function () {
		const strIn = 'https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom';
		const uri1 = URI.parse(strIn);
		const strOut = uri1.toString();
		const uri2 = URI.parse(strOut);

		assert.strictEqual(uri1.scheme, uri2.scheme);
		assert.strictEqual(uri1.authority, uri2.authority);
		assert.strictEqual(uri1.path, uri2.path);
		assert.strictEqual(uri1.query, uri2.query);
		assert.strictEqual(uri1.fragment, uri2.fragment);
		assert.strictEqual(strIn, strOut); // fails here!!
	});

	test.skip('Uri#parse can break path-component #45515', function () {
		const strIn = 'https://firebasestorage.googleapis.com/v0/b/brewlangerie.appspot.com/o/products%2FzVNZkudXJyq8bPGTXUxx%2FBetterave-Sesame.jpg?alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437';
		const uri1 = URI.parse(strIn);
		const strOut = uri1.toString();
		const uri2 = URI.parse(strOut);

		assert.strictEqual(uri1.scheme, uri2.scheme);
		assert.strictEqual(uri1.authority, uri2.authority);
		assert.strictEqual(uri1.path, uri2.path);
		assert.strictEqual(uri1.query, uri2.query);
		assert.strictEqual(uri1.fragment, uri2.fragment);
		assert.strictEqual(strIn, strOut); // fails here!!
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
		for (const value of values) {
			const data = value.toJSON() as UriComponents;
			const clone = URI.revive(data);

			assert.strictEqual(clone.scheme, value.scheme);
			assert.strictEqual(clone.authority, value.authority);
			assert.strictEqual(clone.path, value.path);
			assert.strictEqual(clone.query, value.query);
			assert.strictEqual(clone.fragment, value.fragment);
			assert.strictEqual(clone.fsPath, value.fsPath);
			assert.strictEqual(clone.toString(), value.toString());
		}
		// }
		// console.profileEnd();
	});
	function assertJoined(base: string, fragment: string, expected: string, checkWithUrl: boolean = true) {
		const baseUri = URI.parse(base);
		const newUri = URI.joinPath(baseUri, fragment);
		const actual = newUri.toString(true);
		assert.strictEqual(actual, expected);

		if (checkWithUrl) {
			const actualUrl = new URL(fragment, base).href;
			assert.strictEqual(actualUrl, expected, 'DIFFERENT from URL');
		}
	}
	test('URI#joinPath', function () {

		assertJoined(('file:///foo/'), '../../bazz', 'file:///bazz');
		assertJoined(('file:///foo'), '../../bazz', 'file:///bazz');
		assertJoined(('file:///foo'), '../../bazz', 'file:///bazz');
		assertJoined(('file:///foo/bar/'), './bazz', 'file:///foo/bar/bazz');
		assertJoined(('file:///foo/bar'), './bazz', 'file:///foo/bar/bazz', false);
		assertJoined(('file:///foo/bar'), 'bazz', 'file:///foo/bar/bazz', false);

		// "auto-path" scheme
		assertJoined(('file:'), 'bazz', 'file:///bazz');
		assertJoined(('http://domain'), 'bazz', 'http://domain/bazz');
		assertJoined(('https://domain'), 'bazz', 'https://domain/bazz');
		assertJoined(('http:'), 'bazz', 'http:/bazz', false);
		assertJoined(('https:'), 'bazz', 'https:/bazz', false);

		// no "auto-path" scheme with and w/o paths
		assertJoined(('foo:/'), 'bazz', 'foo:/bazz');
		assertJoined(('foo://bar/'), 'bazz', 'foo://bar/bazz');

		// no "auto-path" + no path -> error
		assert.throws(() => assertJoined(('foo:'), 'bazz', ''));
		assert.throws(() => new URL('bazz', 'foo:'));
		assert.throws(() => assertJoined(('foo://bar'), 'bazz', ''));
		// assert.throws(() => new URL('bazz', 'foo://bar')); Edge, Chrome => THROW, Firefox, Safari => foo://bar/bazz
	});

	test('URI#joinPath (posix)', function () {
		if (isWindows) {
			this.skip();
		}
		assertJoined(('file:///c:/foo/'), '../../bazz', 'file:///bazz', false);
		assertJoined(('file://server/share/c:/'), '../../bazz', 'file://server/bazz', false);
		assertJoined(('file://server/share/c:'), '../../bazz', 'file://server/bazz', false);

		assertJoined(('file://ser/foo/'), '../../bazz', 'file://ser/bazz', false); // Firefox -> Different, Edge, Chrome, Safar -> OK
		assertJoined(('file://ser/foo'), '../../bazz', 'file://ser/bazz', false); // Firefox -> Different, Edge, Chrome, Safar -> OK
	});

	test('URI#joinPath (windows)', function () {
		if (!isWindows) {
			this.skip();
		}
		assertJoined(('file:///c:/foo/'), '../../bazz', 'file:///c:/bazz', false);
		assertJoined(('file://server/share/c:/'), '../../bazz', 'file://server/share/bazz', false);
		assertJoined(('file://server/share/c:'), '../../bazz', 'file://server/share/bazz', false);

		assertJoined(('file://ser/foo/'), '../../bazz', 'file://ser/foo/bazz', false);
		assertJoined(('file://ser/foo'), '../../bazz', 'file://ser/foo/bazz', false);

		//https://github.com/microsoft/vscode/issues/93831
		assertJoined('file:///c:/foo/bar', './other/foo.img', 'file:///c:/foo/bar/other/foo.img', false);
	});

	test('vscode-uri: URI.toString() wrongly encode IPv6 literals #154048', function () {
		assert.strictEqual(URI.parse('http://[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html').toString(), 'http://[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html');

		assert.strictEqual(URI.parse('http://user@[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html').toString(), 'http://user@[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html');
		assert.strictEqual(URI.parse('http://us[er@[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html').toString(), 'http://us%5Ber@[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html');
	});

	test('File paths containing apostrophes break URI parsing and cannot be opened #276075', function () {
		if (isWindows) {
			const filePath = 'C:\\Users\\Abd-al-Haseeb\'s_Dell\\Studio\\w3mage\\wp-content\\database.ht.sqlite';
			const uri = URI.file(filePath);
			assert.strictEqual(uri.path, '/C:/Users/Abd-al-Haseeb\'s_Dell/Studio/w3mage/wp-content/database.ht.sqlite');
			assert.strictEqual(uri.fsPath, 'c:\\Users\\Abd-al-Haseeb\'s_Dell\\Studio\\w3mage\\wp-content\\database.ht.sqlite');
		}
	});


});
