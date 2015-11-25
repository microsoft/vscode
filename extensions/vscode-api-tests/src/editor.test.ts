/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import {workspace, window, Position} from 'vscode';
import {createRandomFile, deleteFile, cleanUp} from './utils';
import {join} from 'path';

suite("editor tests", () => {

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
});