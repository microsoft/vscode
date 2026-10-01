/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CustomEditorInfo } from '../../common/customEditor.js';
import { RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';

suite('CustomEditorInfo', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createCustomEditorInfo(selector: { filenamePattern?: string; language?: string }[]): CustomEditorInfo {
		return new CustomEditorInfo({
			id: 'test.editor',
			displayName: 'Test Editor',
			providerDisplayName: 'Test Provider',
			priority: {
				editor: RegisteredEditorPriority.default,
				diff: RegisteredEditorPriority.default,
			},
			selector,
		});
	}

	test('matches with filenamePattern only', () => {
		const info = createCustomEditorInfo([{ filenamePattern: '*.md' }]);

		assert.strictEqual(info.matches(URI.file('/path/to/readme.md')), true);
		assert.strictEqual(info.matches(URI.file('/path/to/readme.txt')), false);
	});

	test('matches with language only', () => {
		const info = createCustomEditorInfo([{ language: 'markdown' }]);

		// Matches when languageId matches regardless of filename
		assert.strictEqual(info.matches(URI.file('/path/to/notes.notes'), 'markdown'), true);
		assert.strictEqual(info.matches(URI.file('/path/to/notes.notes'), 'MARKDOWN'), true);
		assert.strictEqual(info.matches(URI.file('/path/to/readme.md'), 'markdown'), true);

		// Does not match when languageId differs or is undefined
		assert.strictEqual(info.matches(URI.file('/path/to/notes.notes'), 'plaintext'), false);
		assert.strictEqual(info.matches(URI.file('/path/to/notes.notes'), undefined), false);
	});

	test('matches with combined filenamePattern and language (AND condition)', () => {
		const info = createCustomEditorInfo([{ filenamePattern: 'docs/**', language: 'markdown' }]);

		// Must match BOTH filename and language
		assert.strictEqual(info.matches(URI.file('/path/docs/readme.md'), 'markdown'), true);

		// Fails if filename does not match
		assert.strictEqual(info.matches(URI.file('/path/src/readme.md'), 'markdown'), false);

		// Fails if language does not match
		assert.strictEqual(info.matches(URI.file('/path/docs/readme.md'), 'typescript'), false);
		assert.strictEqual(info.matches(URI.file('/path/docs/readme.md'), undefined), false);
	});

	test('matches with multiple selectors (OR condition)', () => {
		const info = createCustomEditorInfo([
			{ language: 'markdown' },
			{ filenamePattern: '*.preview' }
		]);

		// Matches if either selector matches
		assert.strictEqual(info.matches(URI.file('/path/to/file.any'), 'markdown'), true);
		assert.strictEqual(info.matches(URI.file('/path/to/file.preview'), 'plaintext'), true);
		assert.strictEqual(info.matches(URI.file('/path/to/file.other'), 'plaintext'), false);
	});
});
