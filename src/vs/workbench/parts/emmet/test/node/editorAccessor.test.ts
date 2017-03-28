/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EditorAccessor, ILanguageIdentifierResolver, IGrammarContributions } from 'vs/workbench/parts/emmet/node/editorAccessor';
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

export interface IGrammarContributions {
	getGrammar(mode: string): string;
}

suite('Emmet', () => {

	test('emmet isEnabled', () => {
		withMockCodeEditor([], {}, (editor) => {

			function testIsEnabled(mode: string, scopeName: string, isEnabled = true, profile = {}, excluded = []) {
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
				let editorAccessor = new EditorAccessor(languageIdentifierResolver, editor, profile, excluded, new MockGrammarContributions(scopeName));
				assert.equal(editorAccessor.isEmmetEnabledMode(), isEnabled);
			}

			// emmet supported languages, null is used as the scopeName since it should not be consulted, they map to to mode to the same syntax name
			let emmetSupportedModes = ['html', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl'];
			emmetSupportedModes.forEach(each => {
				testIsEnabled(each, null);
			});

			// mapped syntaxes
			testIsEnabled('typescriptreact', null);
			testIsEnabled('javascriptreact', null);
			testIsEnabled('jsx-tags', null);
			testIsEnabled('sass-indented', null);

			// syntaxes mapped using the scope name of the grammar
			testIsEnabled('markdown', 'text.html.markdown');
			testIsEnabled('handlebars', 'text.html.handlebars');
			testIsEnabled('nunjucks', 'text.html.nunjucks');
			testIsEnabled('laravel-blade', 'text.html.php.laravel-blade');

			// languages that have different Language Id and scopeName
			testIsEnabled('razor', 'text.html.cshtml');
			testIsEnabled('HTML (Eex)', 'text.html.elixir');

			// not enabled syntaxes
			testIsEnabled('java', 'source.java', false);
			testIsEnabled('javascript', 'source.js', false);

			// enabled syntax with user configured setting
			testIsEnabled('java', 'source.java', true, {
				'java': 'html'
			});
		});

		withMockCodeEditor([
			'<?'
		], {}, (editor) => {

			function testIsEnabled(mode: string, scopeName: string, isEnabled = true, profile = {}, excluded = []) {
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
				editor.setPosition({ lineNumber: 1, column: 3 });
				let editorAccessor = new EditorAccessor(languageIdentifierResolver, editor, profile, excluded, new MockGrammarContributions(scopeName));
				assert.equal(editorAccessor.isEmmetEnabledMode(), isEnabled);
			}

			// emmet enabled language that is disabled
			testIsEnabled('php', 'text.html.php', false, {}, ['php']);
		});
	});

	test('emmet syntax profiles', () => {
		withMockCodeEditor([], {}, (editor) => {

			function testSyntax(mode: string, scopeName: string, expectedSyntax: string, profile = {}, excluded = []) {
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
				let editorAccessor = new EditorAccessor(languageIdentifierResolver, editor, profile, excluded, new MockGrammarContributions(scopeName));
				assert.equal(editorAccessor.getSyntax(), expectedSyntax);
			}

			// emmet supported languages, null is used as the scopeName since it should not be consulted, they map to to mode to the same syntax name
			let emmetSupportedModes = ['html', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl'];
			emmetSupportedModes.forEach(each => {
				testSyntax(each, null, each);
			});

			// mapped syntaxes
			testSyntax('typescriptreact', null, 'jsx');
			testSyntax('javascriptreact', null, 'jsx');
			testSyntax('jsx-tags', null, 'jsx');
			testSyntax('sass-indented', null, 'sass');

			// syntaxes mapped using the scope name of the grammar
			testSyntax('markdown', 'text.html.markdown', 'html');
			testSyntax('handlebars', 'text.html.handlebars', 'html');
			testSyntax('nunjucks', 'text.html.nunjucks', 'html');
			testSyntax('laravel-blade', 'text.html.php.laravel-blade', 'html');

			// languages that have different Language Id and scopeName
			testSyntax('razor', 'text.html.cshtml', 'html');
			testSyntax('HTML (Eex)', 'text.html.elixir', 'html');

			// user define mapping
			testSyntax('java', 'source.java', 'html', {
				'java': 'html'
			});
		});
	});
});
