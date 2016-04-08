/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {languages, Uri, Diagnostic, Range} from 'vscode';

suite('languages namespace tests', () => {

	test('diagnostic collection, forEach, clear, has', function () {
		let collection = languages.createDiagnosticCollection('test');
		assert.equal(collection.name, 'test');
		collection.dispose();
		assert.throws(() => collection.name);

		let c = 0;
		collection = languages.createDiagnosticCollection('test2');
		collection.forEach(() => c++);
		assert.equal(c, 0);

		collection.set(Uri.parse('foo:bar'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);
		collection.forEach(() => c++);
		assert.equal(c, 1);

		c = 0;
		collection.clear();
		collection.forEach(() => c++);
		assert.equal(c, 0);

		collection.set(Uri.parse('foo:bar1'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);
		collection.set(Uri.parse('foo:bar2'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);
		collection.forEach(() => c++);
		assert.equal(c, 2);

		assert.ok(collection.has(Uri.parse('foo:bar1')));
		assert.ok(collection.has(Uri.parse('foo:bar2')));
		assert.ok(!collection.has(Uri.parse('foo:bar3')));
		collection.delete(Uri.parse('foo:bar1'));
		assert.ok(!collection.has(Uri.parse('foo:bar1')));
	});

	test('diagnostic collection, immutable read', function () {
		let collection = languages.createDiagnosticCollection('test');
		collection.set(Uri.parse('foo:bar'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);

		let array = collection.get(Uri.parse('foo:bar'));
		assert.throws(() => array.length = 0);
		assert.throws(() => array.pop());
		assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), 'evil'));

		collection.forEach((uri, array) => {
			assert.throws(() => array.length = 0);
			assert.throws(() => array.pop());
			assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), 'evil'));
		});

		array = collection.get(Uri.parse('foo:bar'));
		assert.equal(array.length, 2);
	});
});