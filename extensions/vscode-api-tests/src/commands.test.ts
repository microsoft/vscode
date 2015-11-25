/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import {workspace, window, Position, commands} from 'vscode';
import {createRandomFile, deleteFile, cleanUp} from './utils';
import {join} from 'path';

suite("editor tests", () => {

	teardown(cleanUp);

	// test('calling command completes with the extension host updated properly', () => {
	// 	return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
	// 		return window.showTextDocument(doc).then(editor => {
	// 			assert.equal(window.visibleTextEditors.length, 1);
	// 			return commands.executeCommand('workbench.action.closeAllEditors').then(() => {
	// 				assert.equal(window.visibleTextEditors.length, 0);
	// 			});
	// 		});
	// 	});
	// });
});