/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window} from 'vscode';
import {join} from 'path';
import {cleanUp} from './utils';

suite("window namespace tests", () => {

	teardown((done) => {
		cleanUp().then(() => done(), (error) => done(error));
	});

	test('active text editor', (done) => {
		workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			return window.showTextDocument(doc).then((editor) => {
				const active = window.activeTextEditor;
				assert.ok(active);
				assert.equal(active.document.uri.fsPath, doc.uri.fsPath);
			});
		}).then(() => done(), (error) => done(error));
	});
});