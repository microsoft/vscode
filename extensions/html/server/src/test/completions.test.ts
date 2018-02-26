/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { TextDocument, CompletionList, CompletionItemKind, } from 'vscode-languageserver-types';
import { getLanguageModes } from '../modes/languageModes';
import { applyEdits } from '../utils/edits';
import { getPathCompletionParticipant } from '../modes/pathCompletion';
import { Proposed } from 'vscode-languageserver-protocol';

export interface ItemDescription {
	label: string;
	documentation?: string;
	kind?: CompletionItemKind;
	resultText?: string;
	notAvailable?: boolean;
}


suite('Completions', () => {

	let assertCompletion = function (completions: CompletionList, expected: ItemDescription, document: TextDocument, offset: number) {
		let matches = completions.items.filter(completion => {
			return completion.label === expected.label;
		});
		if (expected.notAvailable) {
			assert.equal(matches.length, 0, `${expected.label} should not existing is results`);
			return;
		}

		assert.equal(matches.length, 1, `${expected.label} should only existing once: Actual: ${completions.items.map(c => c.label).join(', ')}`);
		let match = matches[0];
		if (expected.documentation) {
			assert.equal(match.documentation, expected.documentation);
		}
		if (expected.kind) {
			assert.equal(match.kind, expected.kind);
		}
		if (expected.resultText && match.textEdit) {
			assert.equal(applyEdits(document, [match.textEdit]), expected.resultText);
		}
	};

	const testUri = 'test://test/test.html';

	function assertCompletions(value: string, expected: { count?: number, items?: ItemDescription[] }, uri = testUri, workspaceFolders?: Proposed.WorkspaceFolder[]): void {
		let offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		let document = TextDocument.create(uri, 'html', 0, value);
		let position = document.positionAt(offset);

		var languageModes = getLanguageModes({ css: true, javascript: true });
		var mode = languageModes.getModeAtPosition(document, position);

		if (!workspaceFolders) {
			workspaceFolders = [{ name: 'x', uri: path.dirname(uri) }];
		}

		let participantResult = CompletionList.create([]);
		if (mode.setCompletionParticipants) {
			mode.setCompletionParticipants([getPathCompletionParticipant(document, workspaceFolders, participantResult)]);
		}

		let list = mode.doComplete!(document, position);
		list.items = list.items.concat(participantResult.items);

		if (expected.count) {
			assert.equal(list.items, expected.count);
		}
		if (expected.items) {
			for (let item of expected.items) {
				assertCompletion(list, item, document, offset);
			}
		}
	}

	test('HTML Javascript Completions', function (): any {
		assertCompletions('<html><script>window.|</script></html>', {
			items: [
				{ label: 'location', resultText: '<html><script>window.location</script></html>' },
			]
		});
		assertCompletions('<html><script>$.|</script></html>', {
			items: [
				{ label: 'getJSON', resultText: '<html><script>$.getJSON</script></html>' },
			]
		});
	});
/*
	test('Path completion', function (): any {
		let testUri = Uri.file(path.resolve(__dirname, '../../test/pathCompletionFixtures/foo.html')).fsPath;

		assertCompletions('<div><a href="about/|">', {
			items: [
				{ label: 'about.html', resultText: '<div><a href="about/about.html">' }
			]
		}, testUri);
		assertCompletions(`<div><a href=about/|>`, {
			items: [
				{ label: 'about.html', resultText: `<div><a href=about/about.html>` }
			]
		}, testUri);
		assertCompletions(`<div><a href='about/|'>`, {
			items: [
				{ label: 'about.html', resultText: `<div><a href='about/about.html'>` }
			]
		}, testUri);
		assertCompletions('<div><a href="about/about|.xml">', {
			items: [
				{ label: 'about.html', resultText: '<div><a href="about/about.html">' }
			]
		}, testUri);
		assertCompletions('<div><a href="about/a|">', {
			items: [
				{ label: 'about.html', resultText: '<div><a href="about/about.html">' }
			]
		}, testUri);
		assertCompletions('<div><a href="|">', {
			items: [
				{ label: 'index.html', resultText: '<div><a href="index.html">' },
				{ label: 'about', resultText: '<div><a href="about/">' }
			]
		}, testUri);

	});
	*/
});