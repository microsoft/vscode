/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { URL, ParsedUrl } from 'vs/base/common/network';
import { serialize, deserialize } from 'vs/base/common/marshalling';

function assertUrl(raw:string, scheme:string, domain:string, port:string, path:string, queryString:string, fragmentId:string): void {
	var url = new ParsedUrl(raw);
	assert.equal(url.getScheme(), scheme, 'getScheme ok for ' + raw);
	var protocol = scheme ? scheme + ':' : scheme;
	assert.equal(url.getProtocol(), protocol, 'getProtocol ok for ' + raw);
	assert.equal(url.getDomain(), domain, 'getDomain ok for ' + raw);
	assert.equal(url.getPort(), port, 'getPort ok for ' + raw);
	var host = domain + (port ? ':' + port : '');
	assert.equal(url.getHost(), host, 'getHost ok for ' + raw);
	assert.equal(url.getPath(), path, 'getPath ok for ' + raw);
	assert.equal(url.getQueryString(), queryString, 'getQueryString ok for ' + raw);
	assert.equal(url.getFragmentId(), fragmentId, 'getFragmentId ok for ' + raw);

	// check for equivalent behaviour
	var uri = URI.parse(raw);
	assert.equal(uri.scheme, scheme);
	assert.equal(uri.authority, port ? domain + ':' + port : domain);
	assert.equal(uri.path, path);
	assert.equal(uri.query, queryString);
	assert.equal(uri.fragment, fragmentId);
}

function assertCombine(base:string, relativeUrl:string, expectedUrl:string): void {
	var url = new ParsedUrl(base);
	var result = url.combine(relativeUrl);
	assert.equal(result, expectedUrl, 'combine ok for ' + base + ' and ' + relativeUrl);
}

suite('Network', () => {
	test('urls', () => {
		assertUrl('http://www.test.com:8000/this/that/theother.html?query=foo#hash',
			'http', 'www.test.com', '8000', '/this/that/theother.html', 'query=foo', 'hash'
		);

		assertUrl('http://www.test.com:8000/this/that/theother.html?query=foo',
			'http', 'www.test.com', '8000', '/this/that/theother.html', 'query=foo', ''
		);

		assertUrl('http://www.test.com:8000/this/that/theother.html#hash',
			'http', 'www.test.com', '8000', '/this/that/theother.html', '', 'hash'
		);

		assertUrl('http://www.test.com:8000/#hash',
			'http', 'www.test.com', '8000', '/', '', 'hash'
		);

		assertUrl('http://www.test.com:8000#hash',
			'http', 'www.test.com', '8000', '', '', 'hash'
		);

		assertUrl('http://www.test.com/#hash',
			'http', 'www.test.com', '', '/', '', 'hash'
		);

		assertUrl('http://www.test.com#hash',
			'http', 'www.test.com', '', '', '', 'hash'
		);

		assertUrl('http://www.test.com:8000/this/that/theother.html',
			'http', 'www.test.com', '8000', '/this/that/theother.html', '', ''
		);

		assertUrl('http://www.test.com:8000/',
			'http', 'www.test.com', '8000', '/', '', ''
		);

		assertUrl('http://www.test.com:8000',
			'http', 'www.test.com', '8000', '', '', ''
		);

		assertUrl('http://www.test.com/',
			'http', 'www.test.com', '', '/', '', ''
		);

		assertUrl('//www.test.com/',
			'', 'www.test.com', '', '/', '', ''
		);

		assertUrl('//www.test.com:8000/this/that/theother.html?query=foo#hash',
			'', 'www.test.com', '8000', '/this/that/theother.html', 'query=foo', 'hash'
		);

		assertUrl('//www.test.com/this/that/theother.html?query=foo#hash',
			'', 'www.test.com', '', '/this/that/theother.html', 'query=foo', 'hash'
		);

		assertUrl('https://www.test.com:8000/this/that/theother.html?query=foo#hash',
			'https', 'www.test.com', '8000', '/this/that/theother.html', 'query=foo', 'hash'
		);

		assertUrl('f12://www.test.com:8000/this/that/theother.html?query=foo#hash',
			'f12', 'www.test.com', '8000', '/this/that/theother.html', 'query=foo', 'hash'
		);

		assertUrl('inmemory://model/0',
			'inmemory', 'model', '', '/0', '', ''
		);

		assertUrl('file:///c/far/boo/file.cs', 'file', '', '', '/c/far/boo/file.cs', '', '');

		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '\\test.js',
			'http://www.test.com:8000/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '/test.js',
			'http://www.test.com:8000/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '////test.js',
			'http://www.test.com:8000/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '\\test.js?token=123',
			'http://www.test.com:8000/test.js?token=123'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '\\test.js?query=foo#hash',
			'http://www.test.com:8000/test.js?query=foo#hash'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '\\test.js#hash',
			'http://www.test.com:8000/test.js#hash'
		);

		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', 'test.js',
			'http://www.test.com:8000/this/that/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '../test.js',
			'http://www.test.com:8000/this/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '..\\test.js',
			'http://www.test.com:8000/this/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '..\\test.js?token=123',
			'http://www.test.com:8000/this/test.js?token=123'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '..\\test.js?query=foo#hash',
			'http://www.test.com:8000/this/test.js?query=foo#hash'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/theother.html?query=foo#hash', '..\\test.js#hash',
			'http://www.test.com:8000/this/test.js#hash'
		);

		assertCombine(
			'http://www.test.com:8000/this/that/', 'test.js',
			'http://www.test.com:8000/this/that/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/this/that/', './test.js',
			'http://www.test.com:8000/this/that/test.js'
		);

		assertCombine(
			'http://www.test.com:8000/', './test.js',
			'http://www.test.com:8000/test.js'
		);
		assertCombine(
			'http://www.test.com:8000/', './././test.js',
			'http://www.test.com:8000/test.js'
		);

		assertCombine(
			'http://www.test.com:8000', './././test.js',
			'http://www.test.com:8000/test.js'
		);
		assertCombine(
			'http://www.test.com:8000', 'test.js',
			'http://www.test.com:8000/test.js'
		);
		assertCombine(
			'http://www.test.com', '../test.js',
			'http://www.test.com/test.js'
		);
		assertCombine(
			'http://www.test.com', 'a/b/../../../test.js',
			'http://www.test.com/test.js'
		);
		assertCombine(
			'http://www.test.com/a/b', 'a/b/../../../../../test.js',
			'http://www.test.com/test.js'
		);
		assertCombine(
			'http://www.test.com', 'test.js',
			'http://www.test.com/test.js'
		);
		assertCombine(
			'http://www.test.com', 'a/b/test.js',
			'http://www.test.com/a/b/test.js'
		);
		assertCombine(
			'http://www.test.com', './a/b/test.js',
			'http://www.test.com/a/b/test.js'
		);
		assertCombine(
			'http://www.test.com/index.html', './a/b/test.js',
			'http://www.test.com/a/b/test.js'
		);

		var url = new URL('inmemory://model/1#css');
		assert.equal(url.toUnique(), 'inmemory://model/1');
	});

	test('Bug 16793:# in folder name => mirror models get out of sync', function () {
		var uri = URI.parse('file:///C:/model/1#css');
		assert.equal(deserialize(serialize(uri)).toString(), uri.toString());
	});
});
