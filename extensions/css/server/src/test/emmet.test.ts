/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'mocha';
import * as assert from 'assert';
import { getCSSLanguageService, getSCSSLanguageService } from 'vscode-css-languageservice';
import { TextDocument, CompletionList } from 'vscode-languageserver-types';
import { getEmmetCompletionParticipants } from 'vscode-emmet-helper';

suite('Emmet Support', () => {

	const cssLanguageService = getCSSLanguageService();
	const scssLanguageService = getSCSSLanguageService();

	function assertCompletions(syntax: string, value: string, expectedProposal: string, expectedProposalDoc: string): void {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const document = TextDocument.create('test://test/test.' + syntax, syntax, 0, value);
		const position = document.positionAt(offset);
		const emmetCompletionList: CompletionList = {
			isIncomplete: true,
			items: undefined
		};
		const languageService = syntax === 'scss' ? scssLanguageService : cssLanguageService;
		languageService.setCompletionParticipants([getEmmetCompletionParticipants(document, position, document.languageId, {}, emmetCompletionList)]);
		const stylesheet = languageService.parseStylesheet(document);
		const list = languageService.doComplete!(document, position, stylesheet);

		assert.ok(list);
		assert.ok(emmetCompletionList);

		if (expectedProposal && expectedProposalDoc) {
			let actualLabels = (emmetCompletionList!.items || []).map(c => c.label).sort();
			let actualDocs = (emmetCompletionList!.items || []).map(c => c.documentation).sort();
			assert.ok(actualLabels.indexOf(expectedProposal) !== -1, 'Not found:' + expectedProposal + ' is ' + actualLabels.join(', '));
			assert.ok(actualDocs.indexOf(expectedProposalDoc) !== -1, 'Not found:' + expectedProposalDoc + ' is ' + actualDocs.join(', '));
		} else {
			assert.ok(!emmetCompletionList || !emmetCompletionList.items);
		}
	}

	test('Css Emmet Completions', function (): any {
		assertCompletions('css', '.foo { display: none; m10| }', 'margin: 10px;', 'margin: 10px;');
		assertCompletions('css', 'foo { display: none; pos:f| }', 'position: fixed;', 'position: fixed;');
		assertCompletions('css', 'foo { display: none; margin: a| }', null, null);
		assertCompletions('css', 'foo| { display: none; }', null, null);
		assertCompletions('css', 'foo {| display: none; }', null, null);
		assertCompletions('css', 'foo { display: none;| }', null, null);
		assertCompletions('css', 'foo { display: none|; }', null, null);
		assertCompletions('css', '.foo { display: none; -m-m10| }', 'margin: 10px;', '-moz-margin: 10px;\nmargin: 10px;');
	});

	test('Scss Emmet Completions', function (): any {
		assertCompletions('scss', '.foo { display: none; .bar { m10| } }', 'margin: 10px;', 'margin: 10px;');
		assertCompletions('scss', 'foo { display: none; .bar { pos:f| } }', 'position: fixed;', 'position: fixed;');
		assertCompletions('scss', 'foo { display: none; margin: a| .bar {}}', null, null);
		assertCompletions('scss', 'foo| { display: none; }', null, null);
		assertCompletions('scss', 'foo {| display: none; }', null, null);
		assertCompletions('scss', 'foo { display: none;| }', null, null);
		assertCompletions('scss', 'foo { display: none|; }', null, null);
		assertCompletions('scss', '.foo { display: none; -m-m10| }', 'margin: 10px;', '-moz-margin: 10px;\nmargin: 10px;');
	});

});