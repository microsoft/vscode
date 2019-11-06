/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../utils/dispose';
import { createTestEditor, joinLines, wait } from './testUtils';
import { acceptFirstSuggestion } from './suggestTestHelpers';

const testDocumentUri = vscode.Uri.parse('untitled:test.ts');

suite('JSDoc Completions', () => {
	const _disposables: vscode.Disposable[] = [];

	setup(async () => {
		await wait(100);
	});

	teardown(async () => {
		disposeAll(_disposables);
	});

	test('Should complete jsdoc inside single line comment', async () => {
		await createTestEditor(testDocumentUri,
			`/**$0 */`,
			`function abcdef(x, y) { }`,
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables, { useLineRange: true});
		assert.strictEqual(
			document.getText(),
			joinLines(
				`/**`,
				` *`,
				` * @param {*} x `,
				` * @param {*} y `,
				` */`,
				`function abcdef(x, y) { }`,
			));
	});
});
