/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EmmetEditorAction } from '../../browser/emmetActions.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
class MockGrammarContributions {
    constructor(scopeName) {
        this.scopeName = scopeName;
    }
    getGrammar(mode) {
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
            function testIsEnabled(mode, scopeName, expectedLanguage, expectedParentLanguage) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1tZXRBY3Rpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VtbWV0L3Rlc3QvYnJvd3Nlci9lbW1ldEFjdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBeUIsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1BQU0sd0JBQXdCO0lBRzdCLFlBQVksU0FBaUI7UUFDNUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDNUIsQ0FBQztJQUVNLFVBQVUsQ0FBQyxJQUFZO1FBQzdCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0NBQ0Q7QUFFRCxLQUFLLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtJQUNuQixJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELGtCQUFrQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEVBQUU7WUFDdEUsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFFbkUsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUMxQyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hFLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0RSxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFM0UsU0FBUyxhQUFhLENBQUMsSUFBWSxFQUFFLFNBQWlCLEVBQUUsZ0JBQXlCLEVBQUUsc0JBQStCO2dCQUNqSCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDWixNQUFNLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7Z0JBQ3ZDLENBQUM7Z0JBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDeEIsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO2dCQUNyQyxDQUFDO2dCQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUNuRSxDQUFDO1lBRUQsc0RBQXNEO1lBQ3RELGFBQWEsQ0FBQyxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BFLGFBQWEsQ0FBQyxZQUFZLEVBQUUsc0JBQXNCLEVBQUUsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzFFLGFBQWEsQ0FBQyxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BFLGFBQWEsQ0FBQyxlQUFlLEVBQUUsNkJBQTZCLEVBQUUsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRXZGLDBEQUEwRDtZQUMxRCwrREFBK0Q7WUFDL0Qsa0VBQWtFO1lBRWxFLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUV2QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9