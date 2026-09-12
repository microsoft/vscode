/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ICodeEditorWidgetOptions, CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../editor/common/core/range.js';
import { TestCodeEditorService } from '../../../../editor/test/browser/editorTestServices.js';
import { ComponentFixtureContext, createEditorServices, defineThemedFixtureGroup, defineComponentFixture, createTextModel } from './fixtureUtils.js';

const SAMPLE_CODE = [
	'function greet(name) {',
	'\tconst greeting = "Hello, " + name;',
	'\treturn greeting;',
	'}',
	'',
	'function count(n) {',
	'\tlet sum = 0;',
	'\tfor (let i = 0; i < n; i++) {',
	'\t\tsum += i;',
	'\t}',
	'\treturn sum;',
	'}',
].join('\n');

function renderWhitespaceVariableFont({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '600px';
	container.style.height = '300px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const model = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://whitespace-variable-font.js'),
		'javascript'
	));

	const editorOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			renderWhitespace: 'all',
			allowVariableFonts: true,
			allowVariableLineHeights: true,
		},
		editorOptions
	));

	editor.setModel(model);

	// Apply variable font decorations to some lines using a larger font size
	const codeEditorService = instantiationService.get(ICodeEditorService);

	disposableStore.add(codeEditorService.registerDecorationType('test', 'large-font', {
		fontSize: 3,
		lineHeight: 3,
	}));

	editor.setDecorationsByType('test', 'large-font', [
		{ range: new Range(2, 1, 2, 100) },
		{ range: new Range(3, 1, 3, 100) },
	]);

	disposableStore.add(codeEditorService.registerDecorationType('test', 'different-font-family', {
		fontFamily: 'Georgia, serif',
		fontSize: 3,
		lineHeight: 3,
	}));

	editor.setDecorationsByType('test', 'different-font-family', [
		{ range: new Range(7, 1, 7, 100) },
		{ range: new Range(8, 1, 8, 100) },
	]);

	// TestCodeEditorService stores CSS rules in memory without injecting them into the DOM.
	// In this fixture the editor runs inside a shadow DOM, so we need to manually inject the
	// decoration CSS rules into the shadow root for them to take effect visually.
	const testService = codeEditorService as TestCodeEditorService;
	const shadowRoot = container.getRootNode() as ShadowRoot;
	if (shadowRoot instanceof ShadowRoot) {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(testService.globalStyleSheet.read());
		shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
	}
}

export default defineThemedFixtureGroup({
	WhitespaceVariableFont: defineComponentFixture({
		render: (context) => renderWhitespaceVariableFont(context),
	}),
});
