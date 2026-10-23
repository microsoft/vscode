/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { IModelService } from '../../../common/services/model.js';
import { getIconClasses } from '../../../common/services/getIconClasses.js';

/**
 * Minimal stubs — language detection is irrelevant for the class-generation
 * tests below, so returning null/undefined everywhere is fine.
 */
const nullModelService = { getModel: () => null } as unknown as IModelService;
const nullLanguageService = {
	getLanguageIdByMimeType: () => null,
	guessLanguageIdByFilepathOrFirstLine: () => null,
} as unknown as ILanguageService;

function classesFor(filename: string): string[] {
	return getIconClasses(nullModelService, nullLanguageService, URI.file(`/test/${filename}`));
}

suite('getIconClasses', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('produces dot-based compound extension classes', () => {
		const classes = classesFor('foo.test.ts');
		assert.ok(classes.includes('test.ts-ext-file-icon'));
		assert.ok(classes.includes('ts-ext-file-icon'));
	});

	test('produces underscore-suffix extension class for Go test files', () => {
		const classes = classesFor('foo_test.go');
		assert.ok(classes.includes('_test.go-ext-file-icon'), 'should produce _test.go compound extension');
		assert.ok(classes.includes('go-ext-file-icon'), 'should still produce base .go extension');
	});

	test('produces underscore-suffix for deeply underscored names', () => {
		const classes = classesFor('my_app_test.go');
		assert.ok(classes.includes('_test.go-ext-file-icon'), 'uses last underscore segment');
		assert.ok(classes.includes('go-ext-file-icon'));
	});

	test('handles underscore suffix with compound dot extension', () => {
		const classes = classesFor('foo_test.d.ts');
		assert.ok(classes.includes('_test.d.ts-ext-file-icon'), 'combines underscore suffix with full dot extension');
		assert.ok(classes.includes('d.ts-ext-file-icon'));
		assert.ok(classes.includes('ts-ext-file-icon'));
	});

	test('handles underscore suffix in middle dot segment', () => {
		const classes = classesFor('foo.bar_test.go');
		assert.ok(classes.includes('_test.go-ext-file-icon'), 'detects underscore in non-first dot segment');
		assert.ok(classes.includes('bar_test.go-ext-file-icon'));
		assert.ok(classes.includes('go-ext-file-icon'));
	});

	test('skips leading underscore filenames', () => {
		const classes = classesFor('_hidden.go');
		assert.ok(!classes.includes('_hidden.go-ext-file-icon'), 'leading underscore should not produce a suffix class');
		assert.ok(classes.includes('go-ext-file-icon'));
	});

	test('skips trailing underscore in base name', () => {
		const classes = classesFor('__init__.py');
		assert.ok(classes.includes('py-ext-file-icon'));
		// Should not produce a junk class from the trailing underscore
		const underscoreClasses = classes.filter(c => c.startsWith('_.') && c.endsWith('-ext-file-icon'));
		assert.strictEqual(underscoreClasses.length, 0, 'trailing underscore should not produce a suffix class');
	});

	test('does not produce underscore class for hyphenated names', () => {
		const classes = classesFor('foo-test.go');
		assert.ok(!classes.includes('_test.go-ext-file-icon'), 'hyphens should not be treated as underscore suffix separators');
		assert.ok(classes.includes('go-ext-file-icon'));
	});

	test('no extra classes for files without underscores', () => {
		const classes = classesFor('main.go');
		const extClasses = classes.filter(c => c.endsWith('-ext-file-icon') && c !== 'ext-file-icon');
		assert.deepStrictEqual(extClasses, ['go-ext-file-icon']);
	});
});
