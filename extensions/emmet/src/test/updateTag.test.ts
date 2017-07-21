/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection, commands } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';

suite('Tests for Emmet: Update Tag', () => {
	teardown(closeAllEditors);

	const contents = `
	<div>
		<ul>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
	</div>
	`;

	test('update tag with multiple cursors', () => {
		const expectedContents = `
	<div>
		<ul>
			<li><section>Hello</section></li>
			<section><span>There</span></section>
			<section><li><span>Bye</span></li></section>
		</ul>
	</div>
	`;
		return withRandomFileEditor(contents, (editor, doc) => {
			editor.selections = [
				new Selection(3, 17, 3, 17), // cursor inside tags
				new Selection(4, 14, 4, 14), // cursor inside opening tag
				new Selection(5, 47, 5, 47), // cursor inside closing tag
			];

			return commands.executeCommand('emmet.updateTag', 'section').then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});
});