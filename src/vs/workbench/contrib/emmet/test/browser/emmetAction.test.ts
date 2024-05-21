/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGrammarContributions, EmmetEditorAction } from 'vs/workbench/contrib/emmet/browser/emmetActions';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

class MockGrammarContributions implements IGrammarContributions {
	private scopeName: string;

	constructor(scopeName: string) {
		this.scopeName = scopeName;
	}

	public getGrammar(mode: string): string {
		return this.scopeName;
	}
}

suite('Emmet', () => {
	test('Get language mode and parent mode for emmet', () => {
		withTestCodeEditor([], {}, (editor, viewModel, instantiationService) => {
			const languageService = instantiationService.get(ILanguageService);

			const disposables = new DisposableStore();
			disposables.add(languageService.registerLanguage({ id: 'markdown' }));
			disposables.add(languageService.registerLanguage({ id: 'handlebars' }));
			disposables.add(languageService.registerLanguage({ id: 'nunjucks' }));
			disposables.add(languageService.registerLanguage({ id: 'laravel-blade' }));

			function testIsEnabled(mode: string, scopeName: string, expectedLanguage?: string, expectedParentLanguage?: string) {
				const model = editor.getModel();
				if (!model) {
					assert.fail('Editor model not found');
				}

				model.setLanguage(mode);
				const langOutput = EmmetEditorAction.getLanguage(editor, new MockGrammarContributions(scopeName));
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

			// languages that have different Language Id and scopeName
			// testIsEnabled('razor', 'text.html.cshtml', 'razor', 'html');
			// testIsEnabled('HTML (Eex)', 'text.html.elixir', 'boo', 'html');

			disposables.dispose();

		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
