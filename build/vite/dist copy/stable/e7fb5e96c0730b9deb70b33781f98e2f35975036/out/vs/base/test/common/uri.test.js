/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isWindows } from '../../common/platform.js';
import { URI, isUriComponents } from '../../common/uri.js';
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
        }
        else {
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
        }
        else {
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
        }
        else {
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
        const test = (input, expected) => {
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
            const data = value.toJSON();
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
    function assertJoined(base, fragment, expected, checkWithUrl = true) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL3VyaS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFFLEdBQUcsRUFBaUIsZUFBZSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDMUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBR3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFO0lBQ2pCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDMUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFDaEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFDaEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUM7SUFDbEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixN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QUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztRQUNuSyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztRQUNoTSxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsbUNBQW1DLENBQUMsQ0FBQztRQUNsTSxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztRQUNoTSxNQUFNLENBQUMsV0FBVyxD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O1FBRXZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxtQ0FBbUM7UUFDOUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsSUFBSSxD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