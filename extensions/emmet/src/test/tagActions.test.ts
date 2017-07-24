/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection, commands } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';

suite('Tests for Emmet actions on html tags', () => {
	teardown(closeAllEditors);

	const contents = `
	<div class="hello">
		<ul>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span/>
	</div>
	`;

	test('update tag with multiple cursors', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<li><section>Hello</section></li>
			<section><span>There</span></section>
			<section><li><span>Bye</span></li></section>
		</ul>
		<span/>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 17, 3, 17), // cursor inside tags
				new Selection(4, 5, 4, 5), // cursor inside opening tag
				new Selection(5, 35, 5, 35), // cursor inside closing tag
			];

			return commands.executeCommand('emmet.updateTag', 'section').then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});


	test('remove tag with mutliple cursors', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<li>Hello</li>
			<span>There</span>
			<li><span>Bye</span></li>
		</ul>
		<span/>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 17, 3, 17), // cursor inside tags
				new Selection(4, 5, 4, 5), // cursor inside opening tag
				new Selection(5, 35, 5, 35), // cursor inside closing tag
			];

			return commands.executeCommand('emmet.removeTag').then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('split/join tag with mutliple cursors', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<li><span/></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span></span>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 17, 3, 17), // join tag
				new Selection(7, 5, 7, 5), // split tag
			];

			return commands.executeCommand('emmet.splitJoinTag').then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('match tag with mutliple cursors', () => {
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(1, 0, 1, 0), // just before tag starts, i.e before <
				new Selection(1, 1, 1, 1), // just before tag name starts
				new Selection(1, 2, 1, 2), // inside tag name
				new Selection(1, 6, 1, 6), // after tag name but before opening tag ends
				new Selection(1, 18, 1, 18), // just before opening tag ends
				new Selection(1, 19, 1, 19), // just after opening tag ends
			];

			return commands.executeCommand('emmet.matchTag').then(() => {
				editor.selections.forEach(selection => {
					assert.equal(selection.active.line, 8);
					assert.equal(selection.active.character, 3);
					assert.equal(selection.anchor.line, 8);
					assert.equal(selection.anchor.character, 3);
				});

				return Promise.resolve();
			});
		});
	});

});