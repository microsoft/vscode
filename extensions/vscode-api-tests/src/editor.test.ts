/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window, Position, Range} from 'vscode';
import {createRandomFile, deleteFile, cleanUp} from './utils';

suite('editor tests', () => {

	teardown(cleanUp);

	test('make edit', () => {
		return createRandomFile().then(file => {
			return workspace.openTextDocument(file).then(doc => {
				return window.showTextDocument(doc).then((editor) => {
					return editor.edit((builder) => {
						builder.insert(new Position(0, 0), 'Hello World');
					}).then(applied => {
						assert.ok(applied);
						assert.equal(doc.getText(), 'Hello World');
						assert.ok(doc.isDirty);

						return doc.save().then(saved => {
							assert.ok(saved);
							assert.ok(!doc.isDirty);

							return deleteFile(file);
						});
					});
				});
			});
		});
	});

	test('issue #6281: Edits fail to validate ranges correctly before applying', () => {
		return createRandomFile('Hello world!').then(file => {
			return workspace.openTextDocument(file).then(doc => {
				return window.showTextDocument(doc).then((editor) => {
					return editor.edit((builder) => {
						builder.replace(new Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE), 'new');
					}).then(applied => {
						assert.ok(applied);
						assert.equal(doc.getText(), 'new');
						assert.ok(doc.isDirty);

						return doc.save().then(saved => {
							assert.ok(saved);
							assert.ok(!doc.isDirty);

							return deleteFile(file);
						});
					});
				});
			});
		});
	});
});