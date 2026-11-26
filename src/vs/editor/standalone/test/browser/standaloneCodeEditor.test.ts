/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { applyStandaloneMarkdownImagesDefault } from '../../browser/standaloneCodeEditor.js';

function apply(options: IEditorOptions, isUpdate?: boolean): IEditorOptions {
	return applyStandaloneMarkdownImagesDefault(options, isUpdate);
}

suite('Standalone editor Markdown images', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks remote images by default', () => {
		assert.deepStrictEqual(apply({}).markdownImages, { allowedOrigins: [] });
		assert.deepStrictEqual(apply({ markdownImages: { allowedOrigins: true } }).markdownImages, { allowedOrigins: true });
		assert.deepStrictEqual(apply({ markdownImages: { allowedOrigins: ['https://a.example'] } }).markdownImages, { allowedOrigins: ['https://a.example'] });
	});

	test('keeps blocking when the option is reset', () => {
		assert.deepStrictEqual(apply({ markdownImages: undefined }, true).markdownImages, { allowedOrigins: [] });
		assert.deepStrictEqual(apply({ markdownImages: { allowedOrigins: undefined } }, true).markdownImages, { allowedOrigins: [] });
	});

	test('leaves updates without markdownImages unchanged', () => {
		const options = { fontSize: 12 };
		assert.strictEqual(applyStandaloneMarkdownImagesDefault(options, true), options);
	});
});
