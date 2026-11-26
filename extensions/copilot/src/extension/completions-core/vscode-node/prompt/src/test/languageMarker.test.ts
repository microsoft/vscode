/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// we need useless escapes before `!` or some tooling breaks; contact @johanrosenkilde for details
import {
	comment,
	commentBlockAsSingles,
	getLanguageMarker,
	hasLanguageMarker,
} from '../languageMarker';
import { DocumentInfoWithOffset } from '../prompt';
import * as assert from 'assert';
import * as fs from 'fs';
import { resolve } from 'path';

suite('LanguageMarker Test Suite', function () {
	let doc: DocumentInfoWithOffset;

	setup(function () {
		const source = fs.readFileSync(resolve(__dirname, 'testdata/example.py'), 'utf8');
		const languageId = 'python';

		doc = {
			uri: 'file:///home/user/test.py',
			source,
			languageId,
			offset: 0,
		};
	});

	test('getLanguageMarker', function () {
		doc.languageId = 'python';
		assert.strictEqual(getLanguageMarker(doc), '#!/usr/bin/env python3');
		doc.languageId = 'cpp';
		assert.strictEqual(getLanguageMarker(doc), 'Language: cpp');
		doc.languageId = 'css';
		assert.strictEqual(getLanguageMarker(doc), 'Language: css');
		doc.languageId = 'html';
		assert.strictEqual(getLanguageMarker(doc), '<!DOCTYPE html>');
		doc.languageId = 'php';
		assert.strictEqual(getLanguageMarker(doc), '');
		doc.languageId = 'yaml';
		assert.strictEqual(getLanguageMarker(doc), '# YAML data');
		doc.languageId = 'unknown';
		assert.strictEqual(getLanguageMarker(doc), 'Language: unknown');
	});

	test('hasLanguageMarker', function () {
		doc.languageId = 'python';
		doc.source = 'import mypants\ndef my_socks():\n  pass';
		assert.ok(!hasLanguageMarker(doc));
		doc.source = '#!/bin/python\n' + doc.source; //Note: not the shebang we add ourselves
		assert.ok(hasLanguageMarker(doc));

		doc.languageId = 'html';
		doc.source = '<html><body><p>My favourite web page</p></body></html>';
		assert.ok(!hasLanguageMarker(doc));
		doc.source = '<!DOCTYPE html>' + doc.source;
		assert.ok(hasLanguageMarker(doc));

		doc.languageId = 'shellscript';
		doc.source = 'echo Wonderful script';
		assert.ok(!hasLanguageMarker(doc));
		doc.source = '#!/bin/bash\n' + doc.source;
		assert.ok(hasLanguageMarker(doc));
	});

	test('comment normal', function () {
		assert.strictEqual(comment('', 'python'), '# ');
		assert.strictEqual(comment('hello', 'python'), '# hello');
		assert.strictEqual(comment('hello', 'typescript'), '// hello');
	});

	test('comment demonstrate multiple lines gives unintuitive result', function () {
		assert.strictEqual(comment('hello\nworld', 'typescript'), '// hello\nworld');
	});

	test('comment non-existing language', function () {
		assert.strictEqual(comment('hello', 'nonexistent'), '// hello');
	});

	test('comment normal with default', function () {
		assert.strictEqual(comment('', 'python'), '# ');
		assert.strictEqual(comment('', 'nonexistent'), '// ');
		assert.strictEqual(comment('hello', 'nonexistent'), '// hello');
	});

	test('commentBlockAsSingles normal', function () {
		assert.strictEqual(commentBlockAsSingles('', 'python'), '');
		assert.strictEqual(commentBlockAsSingles('hello', 'python'), '# hello');
		assert.strictEqual(commentBlockAsSingles('hello\nworld', 'python'), '# hello\n# world');
		assert.strictEqual(commentBlockAsSingles('hello\nworld', 'typescript'), '// hello\n// world');
	});

	test('commentBlockAsSingles trailing newline', function () {
		assert.strictEqual(commentBlockAsSingles('hello\nworld\n', 'python'), '# hello\n# world\n');
		assert.strictEqual(commentBlockAsSingles('\n', 'python'), '# \n');
	});

	test('commentBlockAsSingles nonexistent language', function () {
		assert.strictEqual(commentBlockAsSingles('hello\nworld', 'nonexistent'), '// hello\n// world');
	});

	test('commentBlockAsSingles with default', function () {
		assert.strictEqual(commentBlockAsSingles('hello\nworld', 'python'), '# hello\n# world');
		assert.strictEqual(commentBlockAsSingles('hello\nworld', 'nonexistent'), '// hello\n// world');
	});

});
