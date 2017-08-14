/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IGrammarContributions, ILanguageIdentifierResolver, EmmetEditorAction } from 'vs/workbench/parts/emmet/electron-browser/emmetActions';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import assert = require('assert');
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';

//
// To run the emmet tests only change .vscode/launch.json
// {
// 	"name": "Stacks Tests",
// 	"type": "node",
// 	"request": "launch",
// 	"program": "${workspaceRoot}/node_modules/mocha/bin/_mocha",
// 	"stopOnEntry": false,
// 	"args": [
// 		"--timeout",
// 		"999999",
// 		"--colors",
// 		"-g",
// 		"Stacks"   <<<--- Emmet
// 	],
// Select the 'Stacks Tests' launch config and F5
//

class MockGrammarContributions implements IGrammarContributions {
	private scopeName;

	constructor(scopeName: string) {
		this.scopeName = scopeName;
	}

	public getGrammar(mode: string): string {
		return this.scopeName;
	}
}

suite('Emmet', () => {

	test('Get language mode and parent mode for emmet', () => {
		withMockCodeEditor([], {}, (editor) => {

			function testIsEnabled(mode: string, scopeName: string, expectedLanguage?: string, expectedParentLanguage?: string) {
				const languageIdentifier = new LanguageIdentifier(mode, 73);
				const languageIdentifierResolver: ILanguageIdentifierResolver = {
					getLanguageIdentifier: (languageId: LanguageId) => {
						if (languageId === 73) {
							return languageIdentifier;
						}
						throw new Error('Unexpected');
					}
				};
				editor.getModel().setMode(languageIdentifier);
				let langOutput = EmmetEditorAction.getLanguage(languageIdentifierResolver, editor, new MockGrammarContributions(scopeName));
				assert.equal(langOutput.language, expectedLanguage);
				assert.equal(langOutput.parentMode, expectedParentLanguage);

			}

			// syntaxes mapped using the scope name of the grammar
			testIsEnabled('markdown', 'text.html.markdown', 'markdown', 'html');
			testIsEnabled('handlebars', 'text.html.handlebars', 'handlebars', 'html');
			testIsEnabled('nunjucks', 'text.html.nunjucks', 'nunjucks', 'html');
			testIsEnabled('laravel-blade', 'text.html.php.laravel-blade', 'laravel-blade', 'html');

			// languages that have different Language Id and scopeName
			// testIsEnabled('razor', 'text.html.cshtml', 'razor', 'html');
			// testIsEnabled('HTML (Eex)', 'text.html.elixir', 'boo', 'html');

		});
	});
});
