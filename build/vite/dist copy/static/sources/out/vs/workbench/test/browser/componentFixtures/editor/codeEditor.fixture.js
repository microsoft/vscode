/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { createEditorServices, defineThemedFixtureGroup, defineComponentFixture, createTextModel } from '../fixtureUtils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
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
function renderCodeEditor({ container, disposableStore, theme }) {
    container.style.width = '600px';
    container.style.height = '400px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
    const model = disposableStore.add(createTextModel(instantiationService, SAMPLE_CODE, URI.parse('inmemory://sample.ts'), 'typescript'));
    const editorOptions = {
        contributions: []
    };
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
        automaticLayout: true,
        minimap: { enabled: true },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
    }, editorOptions));
    editor.setModel(model);
}
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    CodeEditor: defineComponentFixture({
        labels: { kind: 'screenshot', blocksCi: true },
        render: (context) => renderCodeEditor(context),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUVkaXRvci5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9lZGl0b3IvY29kZUVkaXRvci5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQTJCLG9CQUFvQixFQUFFLHdCQUF3QixFQUFFLHNCQUFzQixFQUFFLGVBQWUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3RKLE9BQU8sRUFBNEIsZ0JBQWdCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUdqSSxNQUFNLFdBQVcsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBcUJuQixDQUFDO0FBRUYsU0FBUyxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUEyQjtJQUN2RixTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7SUFDaEMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDO0lBQ2pDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLDZDQUE2QyxDQUFDO0lBRXZFLE1BQU0sb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsZUFBZSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFFMUYsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQ2hELG9CQUFvQixFQUNwQixXQUFXLEVBQ1gsR0FBRyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxFQUNqQyxZQUFZLENBQ1osQ0FBQyxDQUFDO0lBRUgsTUFBTSxhQUFhLEdBQTZCO1FBQy9DLGFBQWEsRUFBRSxFQUFFO0tBQ2pCLENBQUM7SUFFRixNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDckUsZ0JBQWdCLEVBQ2hCLFNBQVMsRUFDVDtRQUNDLGVBQWUsRUFBRSxJQUFJO1FBQ3JCLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7UUFDMUIsV0FBVyxFQUFFLElBQUk7UUFDakIsb0JBQW9CLEVBQUUsS0FBSztRQUMzQixRQUFRLEVBQUUsRUFBRTtRQUNaLFVBQVUsRUFBRSxvQ0FBb0M7UUFDaEQsZ0JBQWdCLEVBQUUsV0FBVztRQUM3Qix1QkFBdUIsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7S0FDMUMsRUFDRCxhQUFhLENBQ2IsQ0FBQyxDQUFDO0lBRUgsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUQsZUFBZSx3QkFBd0IsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsRUFBRTtJQUM1RCxVQUFVLEVBQUUsc0JBQXNCLENBQUM7UUFDbEMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO1FBQzlDLE1BQU0sRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDO0tBQzlDLENBQUM7Q0FDRixDQUFDLENBQUMifQ==