/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, TextDocument} from 'vscode';
import {join} from 'path';

suite('workspace-namespace', () => {

	test('textDocuments', () => {
		assert.ok(Array.isArray(workspace.textDocuments));
		assert.throws(() => workspace.textDocuments = null);
	});

	test('rootPath', () => {
		assert.equal(workspace.rootPath, join(__dirname, '../testWorkspace'));
		assert.throws(() => workspace.rootPath = 'farboo');
	});

	test('openTextDocument', done => {
		workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			assert.ok(doc);
			done();
		}, err => {
			done(err);
		});
	});

	test('openTextDocument, illegal path', done => {
		workspace.openTextDocument('funkydonky.txt').then(doc => {
			done(new Error('missing error'));
		}, err => {
			done();
		});
	});

	// test('createTextDocument', done => {

	// 	let text = 'Das Pferd isst keinen Reis.'

	// 	workspace.createTextDocument(text).then(doc => {
	// 		assert.equal(doc.getText(), text);
	// 		assert.equal(doc.uri.scheme, 'untitled');
	// 		assert.equal(doc.languageId, 'plaintext');
	// 		done();
	// 	}, err => {
	// 		done(err);
	// 	});
	// });
});