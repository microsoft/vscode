/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'mocha';
import * as assert from 'assert';
import { getHTMLMode } from '../modes/htmlMode';
import { TextDocument, CompletionList } from 'vscode-languageserver-types';
import { getLanguageModelCache } from '../languageModelCache';

import { getLanguageService } from 'vscode-html-languageservice';
import * as embeddedSupport from '../modes/embeddedSupport';
import { getEmmetCompletionParticipants } from 'vscode-emmet-helper';
import { getCSSMode } from '../modes/cssMode';

suite('HTML Emmet Support', () => {

	const htmlLanguageService = getLanguageService();

	function assertCompletions(syntax: string, value: string, expectedProposal: string | null, expectedProposalDoc: string | null): void {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const document = TextDocument.create('test://test/test.' + syntax, syntax, 0, value);
		const position = document.positionAt(offset);
		const documentRegions = getLanguageModelCache<embeddedSupport.HTMLDocumentRegions>(10, 60, document => embeddedSupport.getDocumentRegions(htmlLanguageService, document));
		const mode = syntax === 'html' ? getHTMLMode(htmlLanguageService) : getCSSMode(documentRegions);

		const emmetCompletionList = CompletionList.create([], false);
		mode.setCompletionParticipants!([getEmmetCompletionParticipants(document, position, document.languageId, {}, emmetCompletionList)]);

		const list = mode.doComplete!(document, position);
		assert.ok(list);
		assert.ok(emmetCompletionList);

		if (expectedProposal && expectedProposalDoc) {
			let actualLabels = emmetCompletionList.items.map(c => c.label).sort();
			let actualDocs = emmetCompletionList.items.map(c => c.documentation).sort();
			assert.ok(actualLabels.indexOf(expectedProposal) !== -1, 'Not found:' + expectedProposal + ' is ' + actualLabels.join(', '));
			assert.ok(actualDocs.indexOf(expectedProposalDoc) !== -1, 'Not found:' + expectedProposalDoc + ' is ' + actualDocs.join(', '));
		} else {
			assert.ok(!emmetCompletionList.items.length && !emmetCompletionList.isIncomplete);
		}

	}

	test('Html Emmet Completions', function (): any {
		assertCompletions('html', 'ul|', 'ul', '<ul>|</ul>');
		assertCompletions('html', '<ul|', null, null);
		assertCompletions('html', '<html>ul|</html>', 'ul', '<ul>|</ul>');
		assertCompletions('html', '<img src=|', null, null);
		assertCompletions('html', '<div class=|/>', null, null);
	});

	test('Css Emmet Completions', function (): any {
		assertCompletions('css', '<style>.foo { display: none; m10| }</style>', 'margin: 10px;', 'margin: 10px;');
		assertCompletions('css', '<style>foo { display: none; pos:f| }</style>', 'position: fixed;', 'position: fixed;');
		assertCompletions('css', '<style>foo { display: none; margin: a| }</style>', null, null);
		assertCompletions('css', '<style>foo| { display: none; }</style>', null, null);
		assertCompletions('css', '<style>foo {| display: none; }</style>', null, null);
		assertCompletions('css', '<style>foo { display: none;| }</style>', null, null);
		assertCompletions('css', '<style>foo { display: none|; }</style>', null, null);
		assertCompletions('css', '<style>.foo { display: none; -m-m10| }</style>', 'margin: 10px;', '-moz-margin: 10px;\nmargin: 10px;');
	});
});