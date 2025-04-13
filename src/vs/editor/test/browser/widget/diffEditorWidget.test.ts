import * as assert from 'assert';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { mock } from 'vs/base/test/common/mock';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INotificationService } from 'vs/platform/notification/common/notification';

suite('DiffEditorWidget - Text Selection', () => {
    let diffEditor: DiffEditorWidget;
    let instantiationService: TestInstantiationService;

    setup(() => {
        instantiationService = new TestInstantiationService();
        instantiationService.stub(IContextKeyService, new mock());
        instantiationService.stub(ICodeEditorService, new mock());
        instantiationService.stub(IThemeService, new mock());
        instantiationService.stub(INotificationService, new mock());

        const container = document.createElement('div');
        diffEditor = instantiationService.createInstance(
            DiffEditorWidget,
            container,
            {}
        );
    });

    test('should enable text selection on deleted lines', () => {
        // Create a deleted line element
        const deletedLine = document.createElement('div');
        deletedLine.classList.add('deleted-sign');
        diffEditor['_domElement'].appendChild(deletedLine);

        // Verify selection is enabled
        assert.strictEqual(
            window.getComputedStyle(deletedLine).userSelect,
            'text',
            'Text selection should be enabled on deleted lines'
        );
    });

    test('should enable text selection on child elements of deleted lines', () => {
        // Create a deleted line with child elements
        const deletedLine = document.createElement('div');
        deletedLine.classList.add('deleted-sign');
        
        const child = document.createElement('span');
        deletedLine.appendChild(child);
        
        diffEditor['_domElement'].appendChild(deletedLine);

        // Verify selection is enabled on child
        assert.strictEqual(
            window.getComputedStyle(child).userSelect,
            'text',
            'Text selection should be enabled on child elements'
        );
    });

    test('should include deleted lines in search results', async () => {
        // Setup test content
        const originalModel = diffEditor['_originalEditor'].getModel();
        const modifiedModel = diffEditor['_modifiedEditor'].getModel();

        if (originalModel && modifiedModel) {
            originalModel.setValue('line1\ndeleted line\nline3');
            modifiedModel.setValue('line1\nline3');

            // Trigger a diff computation
            await diffEditor['_updateDecorations']();

            // Search for 'deleted'
            const findController = diffEditor['_originalEditor'].getContribution('editor.contrib.findController');
            findController['_start']('deleted', {});

            // Verify the deleted line is included in search results
            const deletedLines = diffEditor['_domElement'].querySelectorAll('.deleted-sign.highlighted-search-result');
            assert.strictEqual(
                deletedLines.length,
                1,
                'Deleted line should be included in search results'
            );
        }
    });

    teardown(() => {
        diffEditor.dispose();
    });
});