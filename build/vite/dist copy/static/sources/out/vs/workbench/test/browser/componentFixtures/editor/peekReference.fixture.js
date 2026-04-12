/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ReferenceWidget } from '../../../../../editor/contrib/gotoSymbol/browser/peek/referencesWidget.js';
import { ReferencesModel } from '../../../../../editor/contrib/gotoSymbol/browser/referencesModel.js';
import * as peekView from '../../../../../editor/contrib/peekView/browser/peekView.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import '../../../../../editor/contrib/peekView/browser/media/peekViewWidget.css';
import '../../../../../editor/contrib/gotoSymbol/browser/peek/referencesWidget.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
const SAMPLE_CODE = `import { readFile, writeFile } from 'fs';

function processFile(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		readFile(path, 'utf8', (err, data) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(data.toUpperCase());
		});
	});
}

async function main() {
	const result = await processFile('./input.txt');
	await writeFile('./output.txt', result);
	console.log('Done processing file');
}

main();
`;
function renderPeekReference({ container, disposableStore, theme }) {
    container.style.width = '700px';
    container.style.height = '400px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const uri = URI.parse('inmemory://peek-fixture.ts');
    // Store text model reference for the mock service
    const fixtureTextModel = { value: undefined };
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
            reg.define(IListService, ListService);
            reg.defineInstance(peekView.IPeekViewService, new class extends mock() {
                addExclusiveWidget(_editor, _widget) { }
            });
            reg.defineInstance(ITextModelService, new class extends mock() {
                async createModelReference(resource) {
                    // Return a mock reference if we have a text model for this URI
                    const model = fixtureTextModel.value;
                    if (model && resource.toString() === uri.toString()) {
                        const onWillDispose = new Emitter();
                        const textEditorModel = {
                            textEditorModel: model,
                            onWillDispose: onWillDispose.event,
                            isReadonly: () => false,
                            isResolved: () => true,
                            isDisposed: () => false,
                            getLanguageId: () => model.getLanguageId(),
                            createSnapshot: () => model.createSnapshot(),
                            resolve: async () => { },
                            dispose: () => onWillDispose.dispose(),
                        };
                        return {
                            object: textEditorModel,
                            dispose: () => { },
                        };
                    }
                    throw new Error(`No model for ${resource.toString()}`);
                }
                canHandleResource() { return false; }
                registerTextModelContentProvider() { return { dispose: () => { } }; }
            });
        },
    });
    const textModel = disposableStore.add(createTextModel(instantiationService, SAMPLE_CODE, uri, 'typescript'));
    fixtureTextModel.value = textModel;
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
    editor.focus();
    const layoutData = { ratio: 0.7, heightInLines: 10 };
    const referenceWidget = instantiationService.createInstance(ReferenceWidget, editor, true, layoutData);
    disposableStore.add(referenceWidget);
    const range = { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 21 };
    referenceWidget.setTitle('processFile');
    referenceWidget.setMetaTitle('3 references');
    referenceWidget.show(range);
    const links = [
        { uri, range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 21 } },
        { uri, range: { startLineNumber: 16, startColumn: 26, endLineNumber: 16, endColumn: 37 } },
        { uri, range: { startLineNumber: 20, startColumn: 1, endLineNumber: 20, endColumn: 5 } },
    ];
    const model = new ReferencesModel(links, 'processFile');
    disposableStore.add(model);
    referenceWidget.setModel(model);
}
export default defineThemedFixtureGroup({
    PeekReferences: defineComponentFixture({
        render: renderPeekReference,
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVla1JlZmVyZW5jZS5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9lZGl0b3IvcGVla1JlZmVyZW5jZS5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBMkIsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDakwsT0FBTyxFQUFFLGdCQUFnQixFQUE0QixNQUFNLHFFQUFxRSxDQUFDO0FBQ2pJLE9BQU8sRUFBYyxlQUFlLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUN4SCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDdEcsT0FBTyxLQUFLLFFBQVEsTUFBTSw0REFBNEQsQ0FBQztBQUN2RixPQUFPLEVBQTRCLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDdkgsT0FBTyxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUloRyxPQUFPLHlFQUF5RSxDQUFDO0FBQ2pGLE9BQU8sNEVBQTRFLENBQUM7QUFDcEYsT0FBTywwREFBMEQsQ0FBQztBQUVsRSxNQUFNLFdBQVcsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBcUJuQixDQUFDO0FBRUYsU0FBUyxtQkFBbUIsQ0FBQyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUEyQjtJ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