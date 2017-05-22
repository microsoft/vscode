/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');

import mimeCommon = require('vs/base/common/mime');
import mime = require('vs/base/node/mime');

suite('Mime', () => {

	test('detectMimesFromFile (JSON saved as PNG)', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/some.json.png');
		mime.detectMimesFromFile(file).then(mimes => {
			assert.deepEqual(mimes.mimes, ['text/plain']);
			done();
		}, done);
	});

	test('detectMimesFromFile (PNG saved as TXT)', function (done: (err?: any) => void) {
		mimeCommon.registerTextMime({ id: 'text', mime: 'text/plain', extension: '.txt' });
		const file = require.toUrl('./fixtures/some.png.txt');
		mime.detectMimesFromFile(file).then(mimes => {
			assert.deepEqual(mimes.mimes, ['text/plain', 'application/octet-stream']);
			done();
		}, done);
	});

	test('detectMimesFromFile (XML saved as PNG)', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/some.xml.png');
		mime.detectMimesFromFile(file).then(mimes => {
			assert.deepEqual(mimes.mimes, ['text/plain']);
			done();
		}, done);
	});

	test('detectMimesFromFile (QWOFF saved as TXT)', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/some.qwoff.txt');
		mime.detectMimesFromFile(file).then(mimes => {
			assert.deepEqual(mimes.mimes, ['text/plain', 'application/octet-stream']);
			done();
		}, done);
	});

	test('detectMimesFromFile (CSS saved as QWOFF)', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/some.css.qwoff');
		mime.detectMimesFromFile(file).then(mimes => {
			assert.deepEqual(mimes.mimes, ['text/plain']);
			done();
		}, done);
	});

	test('detectMimesFromFile (PDF)', function (done: () => void) {
		const file = require.toUrl('./fixtures/some.pdf');
		mime.detectMimesFromFile(file).then(mimes => {
			assert.deepEqual(mimes.mimes, ['application/octet-stream']);
			done();
		}, done);
	});

	test('autoGuessEncoding (ShiftJIS)', function (done: () => void) {
		const file = require.toUrl('./fixtures/some.shiftjis.txt');
		mime.detectMimesFromFile(file, { autoGuessEncoding: true }).then(mimes => {
			assert.equal(mimes.encoding, 'shiftjis');
			done();
		}, done);
	});

	test('autoGuessEncoding (CP1252)', function (done: () => void) {
		const file = require.toUrl('./fixtures/some.cp1252.txt');
		mime.detectMimesFromFile(file, { autoGuessEncoding: true }).then(mimes => {
			assert.equal(mimes.encoding, 'windows1252');
			done();
		}, done);
	});
});
