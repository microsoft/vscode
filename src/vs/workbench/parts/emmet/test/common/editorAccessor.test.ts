import {EditorAccessor, IGrammarContributions} from 'vs/workbench/parts/emmet/node/editorAccessor';
import {withMockCodeEditor} from 'vs/editor/test/common/mocks/mockCodeEditor';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';
import assert = require('assert');

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

			function testIsEnabled(mode: string, scopeName: string, isEnabled = true, profile = {}) {
				editor.getModel().setMode(new MockMode(mode));
				let editorAccessor = new EditorAccessor(editor, profile, new MockGrammarContributions(scopeName));
				assert.equal(editorAccessor.isEmmetEnabledMode(), isEnabled);
			}

			// emmet supported languages, null is used as the scopeName since it should not be consulted, they map to to mode to the same syntax name
			let emmetSupportedModes = ['html', 'xhtml', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl'];
			emmetSupportedModes.forEach(each => {
				testIsEnabled(each, null);
			});

			// syntaxes mapped to html, hard coded
			let html = ['razor', 'handlebars', 'erb', 'php', 'hbs', 'ejs', 'twig'];  // twig??
			html.forEach(each => {
				testIsEnabled(each, null);
			});

			testIsEnabled('typescriptreact', null);
			testIsEnabled('javascriptreact', null);
			testIsEnabled('sass-indented', null);

			// syntaxes mapped using the scope name of the grammar
			testIsEnabled('markdown', 'text.html.markdown');
			testIsEnabled('nunjucks', 'text.html.nunjucks');
			testIsEnabled('laravel-blade', 'text.html.php.laravel-blade');

			// not enabled syntaxes
			testIsEnabled('java', 'source.java', false);
			testIsEnabled('javascript', 'source.js', false);

			// enabled syntax with user configured setting
			testIsEnabled('java', 'source.java', true, {
				'java': 'html'
			});
		});
	});

	test('emmet syntax profiles', () => {
		withMockCodeEditor([], {}, (editor) => {

			function testSyntax(mode: string, scopeName: string, expectedSyntax: string, profile = {}) {
				editor.getModel().setMode(new MockMode(mode));
				let editorAccessor = new EditorAccessor(editor, profile, new MockGrammarContributions(scopeName));
				assert.equal(editorAccessor.getSyntax(), expectedSyntax);
			}

			// emmet supported languages, null is used as the scopeName since it should not be consulted, they map to to mode to the same syntax name
			let emmetSupportedModes = ['html', 'xhtml', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl'];
			emmetSupportedModes.forEach(each => {
				testSyntax(each, null, each);
			});

			// syntaxes mapped to html, hard coded
			let html = ['razor', 'handlebars', 'erb', 'php', 'hbs', 'ejs', 'twig'];  // twig??
			html.forEach(each => {
				testSyntax(each, null, 'html');
			});

			testSyntax('typescriptreact', null, 'jsx');
			testSyntax('javascriptreact', null, 'jsx');

			testSyntax('sass-indented', null, 'sass');

			// syntaxes mapped using the scope name of the grammar
			testSyntax('markdown', 'text.html.markdown', 'html');
			testSyntax('nunjucks', 'text.html.nunjucks', 'html');
			testSyntax('laravel-blade', 'text.html.php.laravel-blade', 'html');

			// user define mapping
			testSyntax('java', 'source.java', 'html', {
				'java': 'html'
			});
		});
	});
});
