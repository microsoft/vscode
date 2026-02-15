/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../src/vs/base/common/uri';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../src/vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils';

const SAMPLE_CODE = `// Welcome to VS Code
function greet(name: string): string {
	return \`Hello, \${name}!\`;
}

class Counter {
	private _count = 0;

	increment(): void {
		this._count++;
	}

	get count(): number {
		return this._count;
	}
}

const counter = new Counter();
counter.increment();
console.log(greet('World'));
console.log(\`Count: \${counter.count}\`);
`;

function renderCodeEditor({ container, disposableStore, theme }: ComponentFixtureContext): HTMLElement {
	container.style.width = '600px';
	container.style.height = '400px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const model = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://sample.ts'),
		'typescript'
	));

	const editorOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: true },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			fontFamily: 'Consolas, "Courier New", monospace',
			renderWhitespace: 'selection',
			bracketPairColorization: { enabled: true },
		},
		editorOptions
	));

	editor.setModel(model);

	return container;
}

export default defineThemedFixtureGroup({
	CodeEditor: defineComponentFixture({
		render: (context) => renderCodeEditor(context),
	}),
});
