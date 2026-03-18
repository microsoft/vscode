/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'mocha';
import * as assert from 'assert';
import { getLanguageModes, TextDocument, ClientCapabilities } from '../modes/languageModes';
import { getNodeFileFS } from '../node/nodeFs';
import { getDocumentContext } from '../utils/documentContext';

const testUri = 'test://test/test.html';

async function testHoverFor(value: string, expectedHoverContent: string[], uri = testUri): Promise<void> {
	const offset = value.indexOf('|');
	value = value.substr(0, offset) + value.substr(offset + 1);

	const workspace = {
		settings: {},
		folders: [{ name: 'x', uri: uri.substring(0, uri.lastIndexOf('/')) }]
	};

	const document = TextDocument.create(uri, 'html', 0, value);
	const position = document.positionAt(offset);
	const context = getDocumentContext(uri, workspace.folders);

	const languageModes = getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST, getNodeFileFS());
	const mode = languageModes.getModeAtPosition(document, position)!;

	const hover = await mode.doHover!(document, position, context);

	assert.ok(hover, 'Hover should not be null');
	
	if (hover) {
		const contents = typeof hover.contents === 'string' ? hover.contents : hover.contents;
		
		for (const expected of expectedHoverContent) {
			assert.ok(
				contents.includes(expected),
				`Hover contents should include "${expected}". Actual contents:\n${contents}`
			);
		}
	}
}

suite('HTML JavaScript Hover', () => {
	test('Should show JSDoc documentation for DataTransfer', async () => {
		await testHoverFor(
			'<html><script>const dt = new DataTrans|fer();</script></html>',
			[
				'DataTransfer',
				'object is used to hold any data transferred between contexts',
				'MDN Reference',
				'https://developer.mozilla.org'
			]
		);
	});

	test('Should show JSDoc documentation for Blob', async () => {
		await testHoverFor(
			'<html><script>const blob = new Bl|ob();</script></html>',
			[
				'Blob',
				'https://developer.mozilla.org'
			]
		);
	});

	test('Should show documentation for built-in methods', async () => {
		await testHoverFor(
			'<html><script>const str = "hello"; str.toUpper|Case();</script></html>',
			[
				'toUpperCase',
				'string'
			]
		);
	});
});
