/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as path from 'path';
import { providePathSuggestions } from '../../modes/pathCompletion';
import { CompletionItemKind, Range, Position } from 'vscode-languageserver-types';

const fixtureRoot = path.resolve(__dirname, '../../../test/pathCompletionFixtures');

suite('Path Completion - Relative Path', () => {
	const mockRange = Range.create(Position.create(0, 3), Position.create(0, 5));

	test('Current Folder', () => {
		const value = './';
		const activeFileFsPath = path.resolve(fixtureRoot, 'index.html');
		const suggestions = providePathSuggestions(value, mockRange, activeFileFsPath);

		assert.equal(suggestions.length, 3);
		assert.equal(suggestions[0].label, 'about');
		assert.equal(suggestions[1].label, 'index.html');
		assert.equal(suggestions[2].label, 'src');

		assert.equal(suggestions[0].kind, CompletionItemKind.Folder);
		assert.equal(suggestions[1].kind, CompletionItemKind.File);
		assert.equal(suggestions[2].kind, CompletionItemKind.Folder);
	});

	test('Parent Folder', () => {
		const value = '../';
		const activeFileFsPath = path.resolve(fixtureRoot, 'about/about.html');
		const suggestions = providePathSuggestions(value, mockRange, activeFileFsPath);

		assert.equal(suggestions.length, 3);
		assert.equal(suggestions[0].label, 'about');
		assert.equal(suggestions[1].label, 'index.html');
		assert.equal(suggestions[2].label, 'src');

		assert.equal(suggestions[0].kind, CompletionItemKind.Folder);
		assert.equal(suggestions[1].kind, CompletionItemKind.File);
		assert.equal(suggestions[2].kind, CompletionItemKind.Folder);
	});

	test('Adjacent Folder', () => {
		const value = '../src/';
		const activeFileFsPath = path.resolve(fixtureRoot, 'about/about.html');
		const suggestions = providePathSuggestions(value, mockRange, activeFileFsPath);

		assert.equal(suggestions.length, 2);
		assert.equal(suggestions[0].label, 'feature.js');
		assert.equal(suggestions[1].label, 'test.js');

		assert.equal(suggestions[0].kind, CompletionItemKind.File);
		assert.equal(suggestions[1].kind, CompletionItemKind.File);
	});


});

suite('Path Completion - Absolute Path', () => {
	const mockRange = Range.create(Position.create(0, 3), Position.create(0, 5));

	test('Root', () => {
		const value = '/';
		const activeFileFsPath1 = path.resolve(fixtureRoot, 'index.html');
		const activeFileFsPath2 = path.resolve(fixtureRoot, 'about/index.html');

		const suggestions1 = providePathSuggestions(value, mockRange, activeFileFsPath1, fixtureRoot); 
		const suggestions2 = providePathSuggestions(value, mockRange, activeFileFsPath2, fixtureRoot); 

		const verify = (suggestions) => {
			assert.equal(suggestions[0].label, 'about');
			assert.equal(suggestions[1].label, 'index.html');
			assert.equal(suggestions[2].label, 'src');

			assert.equal(suggestions[0].kind, CompletionItemKind.Folder);
			assert.equal(suggestions[1].kind, CompletionItemKind.File);
			assert.equal(suggestions[2].kind, CompletionItemKind.Folder);
		};

		verify(suggestions1);
		verify(suggestions2);
	});

	test('Sub Folder', () => {
		const value = '/src/';
		const activeFileFsPath = path.resolve(fixtureRoot, 'about/about.html');
		const suggestions = providePathSuggestions(value, mockRange, activeFileFsPath, fixtureRoot);

		assert.equal(suggestions.length, 2);
		assert.equal(suggestions[0].label, 'feature.js');
		assert.equal(suggestions[1].label, 'test.js');

		assert.equal(suggestions[0].kind, CompletionItemKind.File);
		assert.equal(suggestions[1].kind, CompletionItemKind.File);
	});
});

suite('Path Completion - Incomplete Path at End', () => {
	const mockRange = Range.create(Position.create(0, 3), Position.create(0, 5));

	test('Incomplete Path that starts with slash', () => {
		const value = '/src/f';
		const activeFileFsPath = path.resolve(fixtureRoot, 'about/about.html');
		const suggestions = providePathSuggestions(value, mockRange, activeFileFsPath, fixtureRoot);

		assert.equal(suggestions.length, 2);
		assert.equal(suggestions[0].label, 'feature.js');
		assert.equal(suggestions[1].label, 'test.js');

		assert.equal(suggestions[0].kind, CompletionItemKind.File);
		assert.equal(suggestions[1].kind, CompletionItemKind.File);
	}); 

	test('Incomplete Path that does not start with slash', () => {
		const value = '../src/f';
		const activeFileFsPath = path.resolve(fixtureRoot, 'about/about.html');
		const suggestions = providePathSuggestions(value, mockRange, activeFileFsPath, fixtureRoot);

		assert.equal(suggestions.length, 2);
		assert.equal(suggestions[0].label, 'feature.js');
		assert.equal(suggestions[1].label, 'test.js');

		assert.equal(suggestions[0].kind, CompletionItemKind.File);
		assert.equal(suggestions[1].kind, CompletionItemKind.File);
	}); 
});

suite('Path Completion - TextEdit', () => {
	test('TextEdit has correct replace text and range', () => {
		const value = './';
		const activeFileFsPath = path.resolve(fixtureRoot, 'index.html');
		const range = Range.create(Position.create(0, 3), Position.create(0, 5));
		const suggestions = providePathSuggestions(value, range, activeFileFsPath); 
		
		assert.equal(suggestions[0].textEdit.newText, 'about');
		assert.equal(suggestions[1].textEdit.newText, 'index.html');
		assert.equal(suggestions[2].textEdit.newText, 'src');

		assert.equal(suggestions[0].textEdit.range.start.character, 4);
		assert.equal(suggestions[1].textEdit.range.start.character, 4);
		assert.equal(suggestions[2].textEdit.range.start.character, 4);

		assert.equal(suggestions[0].textEdit.range.end.character, 4);
		assert.equal(suggestions[1].textEdit.range.end.character, 4);
		assert.equal(suggestions[2].textEdit.range.end.character, 4);
	});
});
