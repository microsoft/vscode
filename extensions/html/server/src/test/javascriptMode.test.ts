/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { getJavascriptMode } from '../modes/javascriptMode';
import { TextDocument } from 'vscode-languageserver-types';
import { getLanguageModelCache } from '../languageModelCache';

import { getLanguageService } from 'vscode-html-languageservice';
import * as embeddedSupport from '../modes/embeddedSupport';

suite('HTML Javascript Support', () => {

	var htmlLanguageService = getLanguageService();

	function assertCompletions(value: string, expectedProposals: string[]): void {
		let offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		let document = TextDocument.create('test://test/test.html', 'html', 0, value);

		let documentRegions = getLanguageModelCache<embeddedSupport.HTMLDocumentRegions>(10, 60, document => embeddedSupport.getDocumentRegions(htmlLanguageService, document));

		var mode = getJavascriptMode(documentRegions);

		let position = document.positionAt(offset);
		let list = mode.doComplete(document, position);
		assert.ok(list);

		let actualLabels = list.items.map(c => c.label).sort();
		for (let expected of expectedProposals) {
			assert.ok(actualLabels.indexOf(expected) !== -1, 'Not found:' + expected + ' is ' + actualLabels.join(', '));
		}
	}


	test('Completions', function (): any {
		assertCompletions('<html><script>window.|</script></html>', ['location']);
		assertCompletions('<html><script>$.|</script></html>', ['getJSON']);
	});
});