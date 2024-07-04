/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { getMimeTypes, registerPlatformLanguageAssociation, registerConfiguredLanguageAssociation } from 'vs/editor/common/services/languagesAssociations';

suite('LanguagesAssociations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Dynamically Register Text Mime', () => {
		let guess = getMimeTypes(URI.file('foo.monaco'));
		assert.deepStrictEqual(guess, ['application/unknown']);

		registerPlatformLanguageAssociation({ id: 'monaco', extension: '.monaco', mime: 'text/monaco' });
		guess = getMimeTypes(URI.file('foo.monaco'));
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);

		guess = getMimeTypes(URI.file('.monaco'));
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);

		registerPlatformLanguageAssociation({ id: 'codefile', filename: 'Codefile', mime: 'text/code' });
		guess = getMimeTypes(URI.file('Codefile'));
		assert.deepStrictEqual(guess, ['text/code', 'text/plain']);

		guess = getMimeTypes(URI.file('foo.Codefile'));
		assert.deepStrictEqual(guess, ['application/unknown']);

		registerPlatformLanguageAssociation({ id: 'docker', filepattern: 'Docker*', mime: 'text/docker' });
		guess = getMimeTypes(URI.file('Docker-debug'));
		assert.deepStrictEqual(guess, ['text/docker', 'text/plain']);

		guess = getMimeTypes(URI.file('docker-PROD'));
		assert.deepStrictEqual(guess, ['text/docker', 'text/plain']);

		registerPlatformLanguageAssociation({ id: 'niceregex', mime: 'text/nice-regex', firstline: /RegexesAreNice/ });
		guess = getMimeTypes(URI.file('Randomfile.noregistration'), 'RegexesAreNice');
		assert.deepStrictEqual(guess, ['text/nice-regex', 'text/plain']);

		guess = getMimeTypes(URI.file('Randomfile.noregistration'), 'RegexesAreNotNice');
		assert.deepStrictEqual(guess, ['application/unknown']);

		guess = getMimeTypes(URI.file('Codefile'), 'RegexesAreNice');
		assert.deepStrictEqual(guess, ['text/code', 'text/plain']);
	});

	test('Mimes Priority', () => {
		registerPlatformLanguageAssociation({ id: 'monaco', extension: '.monaco', mime: 'text/monaco' });
		registerPlatformLanguageAssociation({ id: 'foobar', mime: 'text/foobar', firstline: /foobar/ });

		let guess = getMimeTypes(URI.file('foo.monaco'));
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);

		guess = getMimeTypes(URI.file('foo.monaco'), 'foobar');
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);

		registerPlatformLanguageAssociation({ id: 'docker', filename: 'dockerfile', mime: 'text/winner' });
		registerPlatformLanguageAssociation({ id: 'docker', filepattern: 'dockerfile*', mime: 'text/looser' });
		guess = getMimeTypes(URI.file('dockerfile'));
		assert.deepStrictEqual(guess, ['text/winner', 'text/plain']);

		registerPlatformLanguageAssociation({ id: 'azure-looser', mime: 'text/azure-looser', firstline: /azure/ });
		registerPlatformLanguageAssociation({ id: 'azure-winner', mime: 'text/azure-winner', firstline: /azure/ });
		guess = getMimeTypes(URI.file('azure'), 'azure');
		assert.deepStrictEqual(guess, ['text/azure-winner', 'text/plain']);
	});

	test('Specificity priority 1', () => {
		registerPlatformLanguageAssociation({ id: 'monaco2', extension: '.monaco2', mime: 'text/monaco2' });
		registerPlatformLanguageAssociation({ id: 'monaco2', filename: 'specific.monaco2', mime: 'text/specific-monaco2' });

		assert.deepStrictEqual(getMimeTypes(URI.file('specific.monaco2')), ['text/specific-monaco2', 'text/plain']);
		assert.deepStrictEqual(getMimeTypes(URI.file('foo.monaco2')), ['text/monaco2', 'text/plain']);
	});

	test('Specificity priority 2', () => {
		registerPlatformLanguageAssociation({ id: 'monaco3', filename: 'specific.monaco3', mime: 'text/specific-monaco3' });
		registerPlatformLanguageAssociation({ id: 'monaco3', extension: '.monaco3', mime: 'text/monaco3' });

		assert.deepStrictEqual(getMimeTypes(URI.file('specific.monaco3')), ['text/specific-monaco3', 'text/plain']);
		assert.deepStrictEqual(getMimeTypes(URI.file('foo.monaco3')), ['text/monaco3', 'text/plain']);
	});

	test('Mimes Priority - Longest Extension wins', () => {
		registerPlatformLanguageAssociation({ id: 'monaco', extension: '.monaco', mime: 'text/monaco' });
		registerPlatformLanguageAssociation({ id: 'monaco', extension: '.monaco.xml', mime: 'text/monaco-xml' });
		registerPlatformLanguageAssociation({ id: 'monaco', extension: '.monaco.xml.build', mime: 'text/monaco-xml-build' });

		let guess = getMimeTypes(URI.file('foo.monaco'));
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);

		guess = getMimeTypes(URI.file('foo.monaco.xml'));
		assert.deepStrictEqual(guess, ['text/monaco-xml', 'text/plain']);

		guess = getMimeTypes(URI.file('foo.monaco.xml.build'));
		assert.deepStrictEqual(guess, ['text/monaco-xml-build', 'text/plain']);
	});

	test('Mimes Priority - User configured wins', () => {
		registerConfiguredLanguageAssociation({ id: 'monaco', extension: '.monaco.xnl', mime: 'text/monaco' });
		registerPlatformLanguageAssociation({ id: 'monaco', extension: '.monaco.xml', mime: 'text/monaco-xml' });

		const guess = getMimeTypes(URI.file('foo.monaco.xnl'));
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);
	});

	test('Mimes Priority - Pattern matches on path if specified', () => {
		registerPlatformLanguageAssociation({ id: 'monaco', filepattern: '**/dot.monaco.xml', mime: 'text/monaco' });
		registerPlatformLanguageAssociation({ id: 'other', filepattern: '*ot.other.xml', mime: 'text/other' });

		const guess = getMimeTypes(URI.file('/some/path/dot.monaco.xml'));
		assert.deepStrictEqual(guess, ['text/monaco', 'text/plain']);
	});

	test('Mimes Priority - Last registered mime wins', () => {
		registerPlatformLanguageAssociation({ id: 'monaco', filepattern: '**/dot.monaco.xml', mime: 'text/monaco' });
		registerPlatformLanguageAssociation({ id: 'other', filepattern: '**/dot.monaco.xml', mime: 'text/other' });

		const guess = getMimeTypes(URI.file('/some/path/dot.monaco.xml'));
		assert.deepStrictEqual(guess, ['text/other', 'text/plain']);
	});

	test('Data URIs', () => {
		registerPlatformLanguageAssociation({ id: 'data', extension: '.data', mime: 'text/data' });

		assert.deepStrictEqual(getMimeTypes(URI.parse(`data:;label:something.data;description:data,`)), ['text/data', 'text/plain']);
	});
});
