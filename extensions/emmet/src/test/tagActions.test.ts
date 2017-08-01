/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { removeTag } from '../removeTag';
import { updateTag } from '../updateTag';
import { matchTag } from '../matchTag';
import { splitJoinTag } from '../splitJoinTag';
import { mergeLines } from '../mergeLines';

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

			return updateTag('section').then(() => {
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

			return removeTag().then(() => {
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

			return splitJoinTag().then(() => {
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

			matchTag();

			editor.selections.forEach(selection => {
				assert.equal(selection.active.line, 8);
				assert.equal(selection.active.character, 3);
				assert.equal(selection.anchor.line, 8);
				assert.equal(selection.anchor.character, 3);
			});

			return Promise.resolve();
		});
	});

	test('merge lines of tag with children when empty selection', () => {
		const expectedContents = `
	<div class="hello">
		<ul><li><span>Hello</span></li><li><span>There</span></li><div><li><span>Bye</span></li></div></ul>
		<span/>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(2, 3, 2, 3)
			];

			return mergeLines().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('merge lines is no-op when start and end nodes are on the same line', () => {
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 9, 3, 9), // cursor is inside the <span> in <li><span>Hello</span></li>
				new Selection(4, 5, 4, 5), // cursor is inside the <li> in <li><span>Hello</span></li>
				new Selection(5, 5, 5, 20) // selection spans multiple nodes in the same line
			];

			return mergeLines().then(() => {
				assert.equal(doc.getText(), contents);
				return Promise.resolve();
			});
		});
	});
});

