/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Enable automatic dark mode for accessibility.
const dark = matchMedia('(prefers-color-scheme: dark)');
monaco.editor.setTheme(dark.matches ? 'vs-dark' : 'vs-light');
dark.addEventListener('change', () => {
	monaco.editor.setTheme(dark.matches ? 'vs-dark' : 'vs-light');
});

const content = `
function big(name: string): undefined {
	console.log("Hello", name, "!")
}
`;

const model = monaco.editor.createModel(content, undefined, monaco.Uri.file('example.ts'));

const editor = monaco.editor.create(document.getElementById('editor')!, {
	automaticLayout: true,
	allowVariableFonts: true,
	allowVariableFontsInAccessibilityMode: true,
	allowVariableLineHeights: true,
	fontFamily: 'Arial',
	fontVariations: true,
	model,
	wordWrap: 'on',
	wrappingStrategy: 'advanced',
});

// Make the model and editor available globally for fiddling in the console.
Object.assign(globalThis, {
	editor,
	model,
});

const collection = editor.createDecorationsCollection();

function updateDecorations() {
	const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

	for (const match of model.getValue().matchAll(/big/g)) {
		const position = model.getPositionAt(match.index);

		newDecorations.push({
			range: {
				startLineNumber: position.lineNumber,
				startColumn: position.column,
				endLineNumber: position.lineNumber,
				endColumn: position.column + match[0].length,
			},
			options: {
				inlineClassNameAffectsLetterSpacing: true,
				fontFamily: 'Monospace',
				fontStyle: 'italic',
				fontWeight: 'bold',
				fontSize: '40px',
				lineHeight: 56,
				inlineClassName: 'big'
			}
		});
		console.log('newDecorations : ', newDecorations)
	}


	collection.set(newDecorations);
}

model.onDidChangeContent(updateDecorations);
updateDecorations();
