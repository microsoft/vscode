/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Selection } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { updateImageSize } from '../updateImageSize';

suite('Tests for Emmet actions on html tags', () => {
	teardown(closeAllEditors);

	const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAHYcAAB2HAY/l8WUAAAATSURBVBhXY/jPwADGDP////8PAB/uBfuDMzhuAAAAAElFTkSuQmCC';
	const imageWidth = 2;
	const imageHeight = 2;

	test('update image css with multiple cursors in css file', () => {
		const cssContents = `
		.one {
			margin: 10px;
			padding: 10px;
			background-image: url('${imageUrl}');
		}
		.two {
			background-image: url('${imageUrl}');
			height: 42px;
		}
		.three {
			background-image: url('${imageUrl}');
			width: 42px;
		}
	`;
		const expectedContents = `
		.one {
			margin: 10px;
			padding: 10px;
			background-image: url('${imageUrl}');
			width: ${imageWidth}px;
			height: ${imageHeight}px;
		}
		.two {
			background-image: url('${imageUrl}');
			width: ${imageWidth}px;
			height: ${imageHeight}px;
		}
		.three {
			background-image: url('${imageUrl}');
			height: ${imageHeight}px;
			width: ${imageWidth}px;
		}
	`;
		return withRandomFileEditor(cssContents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(4, 50, 4, 50),
				new Selection(7, 50, 7, 50),
				new Selection(11, 50, 11, 50)
			];

			return updateImageSize()!.then(() => {
				assert.strictEqual(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('update image size in css in html file with multiple cursors', () => {
		const htmlWithCssContents = `
		<html>
			<style>
				.one {
					margin: 10px;
					padding: 10px;
					background-image: url('${imageUrl}');
				}
				.two {
					background-image: url('${imageUrl}');
					height: 42px;
				}
				.three {
					background-image: url('${imageUrl}');
					width: 42px;
				}
			</style>
		</html>
	`;
		const expectedContents = `
		<html>
			<style>
				.one {
					margin: 10px;
					padding: 10px;
					background-image: url('${imageUrl}');
					width: ${imageWidth}px;
					height: ${imageHeight}px;
				}
				.two {
					background-image: url('${imageUrl}');
					width: ${imageWidth}px;
					height: ${imageHeight}px;
				}
				.three {
					background-image: url('${imageUrl}');
					height: ${imageHeight}px;
					width: ${imageWidth}px;
				}
			</style>
		</html>
	`;
		return withRandomFileEditor(htmlWithCssContents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(6, 50, 6, 50),
				new Selection(9, 50, 9, 50),
				new Selection(13, 50, 13, 50)
			];

			return updateImageSize()!.then(() => {
				assert.strictEqual(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('update image size in img tag in html file with multiple cursors', () => {
		const htmlwithimgtag = `
		<html>
			<img id="one" src="${imageUrl}" />
			<img id="two" src="${imageUrl}" width="56" />
			<img id="three" src="${imageUrl}" height="56" />
		</html>
	`;
		const expectedContents = `
		<html>
			<img id="one" src="${imageUrl}" width="${imageWidth}" height="${imageHeight}" />
			<img id="two" src="${imageUrl}" width="${imageWidth}" height="${imageHeight}" />
			<img id="three" src="${imageUrl}" height="${imageHeight}" width="${imageWidth}" />
		</html>
	`;
		return withRandomFileEditor(htmlwithimgtag, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(2, 50, 2, 50),
				new Selection(3, 50, 3, 50),
				new Selection(4, 50, 4, 50)
			];

			return updateImageSize()!.then(() => {
				assert.strictEqual(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});
});
