/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection, commands } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';

suite('Tests for Emmet: Reflect CSS Value command', () => {
	teardown(closeAllEditors);

	const contents = `
	.header {
		margin: 10px;
		padding: 10px;
		transform: rotate(50deg);
		-moz-transform: rotate(20deg);
		-o-transform: rotate(50deg);
		-webkit-transform: rotate(50deg);
		-ms-transform: rotate(50deg);
	}
	`;

	test('reflectCssValue', function (): any {

		return withRandomFileEditor(contents, '.css', (editor, doc) => {
			editor.selections = [new Selection(5, 10, 5, 10)];
			return commands.executeCommand('emmet.reflectCssValue').then(() => {
				assert.equal(doc.getText(), contents.replace(/\(50deg\)/g, '(20deg)'));
				return Promise.resolve();
			});
		});
	});


});