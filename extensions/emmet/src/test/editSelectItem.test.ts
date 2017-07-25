/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { fetchEditPoint } from '../editPoint';
import { fetchSelectItem } from '../selectItem';

suite('Tests for Next/Previous Select/Edit point actions', () => {
	teardown(closeAllEditors);

	const cssContents = `
.boo {
	margin: 20px 10px;
	background-image: url('tryme.png');
}
		
.boo .hoo {
	margin: 10px;
}
`;

	const htmlContents = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title></title>
</head>
<body>
	<div>
		
	</div>
	<div class="header">
		<ul class="nav main">
			<li class="item">Item 1</li>
			<li class="item">Item 2</li>
		</ul>
	</div>
</body>
</html>
`;

	test('Emmet Next/Prev Edit point in html file', function (): any {
		return withRandomFileEditor(htmlContents, '.html', (editor, doc) => {
			editor.selections = [new Selection(1, 5, 1, 5)];

			let expectedNextEditPoints: [number, number][] = [[4, 16], [6, 8], [10, 2], [20, 0]];
			expectedNextEditPoints.forEach(([line, col]) => {
				fetchEditPoint('next');
				testSelection(editor.selection, line, col);
			});

			let expectedPrevEditPoints = [[10, 2], [6, 8], [4, 16], [0, 0]];
			expectedPrevEditPoints.forEach(([line, col]) => {
				fetchEditPoint('prev');
				testSelection(editor.selection, line, col);
			});

			return Promise.resolve();
		});
	});

	test('Emmet Select Next/Prev Item in html file', function (): any {
		return withRandomFileEditor(htmlContents, '.html', (editor, doc) => {
			editor.selections = [new Selection(2, 2, 2, 2)];

			let expectedNextItemPoints: [number, number, number][] = [
				[2, 1, 5],   // html
				[2, 6, 15],  // lang="en"
				[2, 12, 14], // en
				[3, 1, 5],   // head
				[4, 2, 6],   // meta
				[4, 7, 17], // charset=""
				[5, 2, 6],   // meta
				[5, 7, 22], // name="viewport"
				[5, 13, 21], // viewport
				[5, 23, 70], // content="width=device-width, initial-scale=1.0"
				[5, 32, 69], // width=device-width, initial-scale=1.0
				[5, 32, 51], // width=device-width,
				[5, 52, 69], // initial-scale=1.0
				[6, 2, 7]   // title
			];
			expectedNextItemPoints.forEach(([line, colstart, colend]) => {
				fetchSelectItem('next');
				testSelection(editor.selection, line, colstart, colend);
			});

			editor.selections = [new Selection(6, 15, 6, 15)];
			expectedNextItemPoints.reverse().forEach(([line, colstart, colend]) => {
				fetchSelectItem('prev');
				testSelection(editor.selection, line, colstart, colend);
			});

			return Promise.resolve();
		});
	});

	test('Emmet Select Next/Prev Item in css file', function (): any {
		return withRandomFileEditor(cssContents, '.css', (editor, doc) => {
			editor.selections = [new Selection(0, 0, 0, 0)];

			let expectedNextItemPoints: [number, number, number][] = [
				[1, 0, 4],   // .boo
				[2, 1, 19],  // margin: 20px 10px;
				[2, 9, 18],   // 20px 10px
				[2, 9, 13],   // 20px
				[2, 14, 18], // 10px
				[3, 1, 36],   // background-image: url('tryme.png');
				[3, 19, 35], // url('tryme.png')
				[6, 0, 9], // .boo .hoo
				[7, 1, 14], // margin: 10px;
				[7, 9, 13], // 10px
			];
			expectedNextItemPoints.forEach(([line, colstart, colend]) => {
				fetchSelectItem('next');
				testSelection(editor.selection, line, colstart, colend);
			});

			editor.selections = [new Selection(9, 0, 9, 0)];
			expectedNextItemPoints.reverse().forEach(([line, colstart, colend]) => {
				fetchSelectItem('prev');
				testSelection(editor.selection, line, colstart, colend);
			});

			return Promise.resolve();
		});
	});

});

function testSelection(selection: Selection, line: number, startChar: number, endChar?: number) {
	assert.equal(selection.isSingleLine, true);
	assert.equal(selection.anchor.line, line);
	assert.equal(selection.anchor.character, startChar);
	if (!endChar) {
		assert.equal(selection.isEmpty, true);
	} else {
		assert.equal(selection.active.character, endChar);
	}
}