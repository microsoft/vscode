/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window} from 'vscode';
import {join} from 'path';
import {cleanUp, pathEquals} from './utils';

suite("window namespace tests", () => {

	teardown(cleanUp);

	test('active text editor', () => {
		return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			return window.showTextDocument(doc).then((editor) => {
				const active = window.activeTextEditor;
				assert.ok(active);
				assert.ok(pathEquals(active.document.uri.fsPath, doc.uri.fsPath));
			});
		});
	});
});