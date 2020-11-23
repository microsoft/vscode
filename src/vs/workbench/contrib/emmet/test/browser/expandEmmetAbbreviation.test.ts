/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGrammarContributions, ILanguageIdentifierResolver, ExpandEmmetAbbreviationCommand } from 'vs/workbench/contrib/emmet/browser/expandEmmetAbbreviation';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import * as assert from 'assert';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';

class MockGrammarContributions implements IGrammarContributions {
	private scopeName: string;

	constructor(scopeName: string) {
		this.scopeName = scopeName;
	}

	public getGrammar(_: string): string {
		return this.scopeName;
	}
}

suite('Emmet expandAbbreviation command', () => {
	test('gets language mode and parent mode for Emmet', () => {
		withTestCodeEditor([], {}, (editor) => {
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
				const model = editor.getModel();
				if (!model) {
					assert.fail('Editor model not found');
				}

				model.setMode(languageIdentifier);
				const langOutput = ExpandEmmetAbbreviationCommand.getLanguage(languageIdentifierResolver, editor, new MockGrammarContributions(scopeName));
				if (!langOutput) {
					assert.fail('langOutput not found');
				}

				assert.strictEqual(langOutput.language, expectedLanguage);
				assert.strictEqual(langOutput.parentMode, expectedParentLanguage);
			}

			// syntaxes mapped using the scope name of the grammar
			testIsEnabled('markdown', 'text.html.markdown', 'markdown', 'html');
			testIsEnabled('handlebars', 'text.html.handlebars', 'handlebars', 'html');
			testIsEnabled('nunjucks', 'text.html.nunjucks', 'nunjucks', 'html');
			testIsEnabled('laravel-blade', 'text.html.php.laravel-blade', 'laravel-blade', 'html');

			// basic syntaxes
			testIsEnabled('html', 'text.html.derivative', 'html', 'html');
			testIsEnabled('css', 'source.css', 'css', 'css');
			testIsEnabled('scss', 'source.css.scss', 'scss', 'scss');
			testIsEnabled('xml', 'text.xml', 'xml', 'xml');
			testIsEnabled('xsl', 'text.xml.xsl', 'xsl', 'xsl');

			// syntaxes that combine HTML and TS/JS
			// expanding inside of HTML tags within jsx/tsx
			testIsEnabled('jsx-tags', 'source.js.jsx', 'jsx', 'jsx');
			// expanding outside of HTML tags within jsx/tsx
			testIsEnabled('javascriptreact', 'source.js.jsx', 'jsx', 'jsx');
			testIsEnabled('typescriptreact', 'source.tsx', 'jsx', 'jsx');

			// syntaxes that combine HTML and some other language
			testIsEnabled('razor', 'text.html.cshtml', 'razor', 'html');
		});
	});
});
