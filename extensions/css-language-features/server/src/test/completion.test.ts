/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import Uri from 'vscode-uri';
import { TextDocument, CompletionList } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { getPathCompletionParticipant } from '../pathCompletion';
import { getCSSLanguageService } from 'vscode-css-languageservice';

export interface ItemDescription {
	label: string;
	resultText?: string;
}

suite('Completions', () => {
	const cssLanguageService = getCSSLanguageService();

	let assertCompletion = function (completions: CompletionList, expected: ItemDescription, document: TextDocument, offset: number) {
		let matches = completions.items.filter(completion => {
			return completion.label === expected.label;
		});

		assert.equal(matches.length, 1, `${expected.label} should only existing once: Actual: ${completions.items.map(c => c.label).join(', ')}`);
		let match = matches[0];
		if (expected.resultText && match.textEdit) {
			assert.equal(TextDocument.applyEdits(document, [match.textEdit]), expected.resultText);
		}
	};

	function assertCompletions(value: string, expected: { count?: number, items?: ItemDescription[] }, testUri: string, workspaceFolders?: WorkspaceFolder[]): void {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const document = TextDocument.create(testUri, 'css', 0, value);
		const position = document.positionAt(offset);

		if (!workspaceFolders) {
			workspaceFolders = [{ name: 'x', uri: testUri.substr(0, testUri.lastIndexOf('/')) }];
		}

		let participantResult = CompletionList.create([]);
		cssLanguageService.setCompletionParticipants([getPathCompletionParticipant(document, workspaceFolders, participantResult)]);

		const stylesheet = cssLanguageService.parseStylesheet(document);
		let list = cssLanguageService.doComplete(document, position, stylesheet)!;
		list.items = list.items.concat(participantResult.items);

		if (expected.count) {
			assert.equal(list.items.length, expected.count);
		}
		if (expected.items) {
			for (let item of expected.items) {
				assertCompletion(list, item, document, offset);
			}
		}
	}

	test('CSS Path completion', function () {
		let testUri = Uri.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/about/about.css')).toString();
		let folders = [{ name: 'x', uri: Uri.file(path.resolve(__dirname, '../../test')).toString() }];

		assertCompletions('html { background-image: url("./|")', {
			items: [
				{ label: 'about.html', resultText: 'html { background-image: url("./about.html")' }
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url('../|')`, {
			items: [
				{ label: 'about/', resultText: `html { background-image: url('../about/')` },
				{ label: 'index.html', resultText: `html { background-image: url('../index.html')` },
				{ label: 'src/', resultText: `html { background-image: url('../src/')` }
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url('../src/a|')`, {
			items: [
				{ label: 'feature.js', resultText: `html { background-image: url('../src/feature.js')` },
				{ label: 'data/', resultText: `html { background-image: url('../src/data/')` },
				{ label: 'test.js', resultText: `html { background-image: url('../src/test.js')` }
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url('../src/data/f|.asar')`, {
			items: [
				{ label: 'foo.asar', resultText: `html { background-image: url('../src/data/foo.asar')` }
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url('|')`, {
			items: [
				{ label: 'about.css', resultText: `html { background-image: url('about.css')` },
				{ label: 'about.html', resultText: `html { background-image: url('about.html')` },
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url('/|')`, {
			items: [
				{ label: 'pathCompletionFixtures/', resultText: `html { background-image: url('/pathCompletionFixtures/')` }
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url('/pathCompletionFixtures/|')`, {
			items: [
				{ label: 'about/', resultText: `html { background-image: url('/pathCompletionFixtures/about/')` },
				{ label: 'index.html', resultText: `html { background-image: url('/pathCompletionFixtures/index.html')` },
				{ label: 'src/', resultText: `html { background-image: url('/pathCompletionFixtures/src/')` }
			]
		}, testUri, folders);

		assertCompletions(`html { background-image: url("/|")`, {
			items: [
				{ label: 'pathCompletionFixtures/', resultText: `html { background-image: url("/pathCompletionFixtures/")` }
			]
		}, testUri, folders);
	});
});