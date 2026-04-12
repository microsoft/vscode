/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { RenameWidget } from '../../../../../editor/contrib/rename/browser/renameWidget.js';
import '../../../../../editor/contrib/rename/browser/renameWidget.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
const SAMPLE_CODE = `class UserService {
	private _users: Map<string, User> = new Map();

	getUser(userId: string): User | undefined {
		return this._users.get(userId);
	}

	addUser(user: User): void {
		this._users.set(user.id, user);
	}
}
`;
function renderRenameWidget(options) {
    const { container, disposableStore, theme } = options;
    container.style.width = '500px';
    container.style.height = '280px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
    const textModel = disposableStore.add(createTextModel(instantiationService, SAMPLE_CODE, URI.parse('inmemory://rename-fixture.ts'), 'typescript'));
    const editorWidgetOptions = {
        contributions: []
    };
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 14,
        cursorBlinking: 'solid',
    }, editorWidgetOptions));
    editor.setModel(textModel);
    editor.setPosition({ lineNumber: options.cursorLine, column: options.cursorColumn });
    const renameWidget = instantiationService.createInstance(RenameWidget, editor, ['editor.action.rename', 'editor.action.rename']);
    disposableStore.add(renameWidget);
    const cts = new CancellationTokenSource();
    disposableStore.add(cts);
    renameWidget.getInput({
        startLineNumber: options.cursorLine,
        startColumn: options.rangeStartColumn,
        endLineNumber: options.cursorLine,
        endColumn: options.rangeEndColumn,
    }, options.currentName, false, undefined, cts);
}
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    RenameVariable: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (context) => renderRenameWidget({
            ...context,
            cursorLine: 4,
            cursorColumn: 2,
            currentName: 'getUser',
            rangeStartColumn: 2,
            rangeEndColumn: 9,
        }),
    }),
    RenameClass: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (context) => renderRenameWidget({
            ...context,
            cursorLine: 1,
            cursorColumn: 7,
            currentName: 'UserService',
            rangeStartColumn: 7,
            rangeEndColumn: 18,
        }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lV2lkZ2V0LmZpeHR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2VkaXRvci9yZW5hbWVXaWRnZXQuZml4dHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUEyQixvQkFBb0IsRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN0SixPQUFPLEVBQUUsZ0JBQWdCLEVBQTRCLE1BQU0scUVBQXFFLENBQUM7QUFDakksT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRTVGLE9BQU8sK0RBQStELENBQUM7QUFDdkUsT0FBTywwREFBMEQsQ0FBQztBQUVsRSxNQUFNLFdBQVcsR0FBRzs7Ozs7Ozs7Ozs7Q0FXbkIsQ0FBQztBQVVGLFNBQVMsa0JBQWtCLENBQUMsT0FBNkI7SUFDeEQsTUFBTSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQ3RELFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztJQUNoQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUM7SUFDakMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsNkNBQTZDLENBQUM7SUFFdkUsTUFBTSxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQyxlQUFlLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUUxRixNQUFNLFNBQVMsR0FB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