/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { RenameTool } from '../../../browser/tools/renameTool.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
function getTextContent(result) {
    const part = result.content.find((p) => p.kind === 'text');
    return part?.value ?? '';
}
suite('RenameTool', () => {
    const disposables = new DisposableStore();
    let langFeatures;
    const testUri = URI.parse('file:///test/file.ts');
    const testContent = [
        'import { MyClass } from "./myClass";',
        '',
        'function doSomething() {',
        '\tconst instance = new MyClass();',
        '\tinstance.run();',
        '}',
    ].join('\n');
    function makeEdit(resource, range, text) {
        return { resource, versionId: undefined, textEdit: { range, text } };
    }
    function createMockTextModelService(model) {
        return {
            _serviceBrand: undefined,
            createModelReference: async () => ({
                object: { textEditorModel: model },
                dispose: () => { },
            }),
            registerTextModelContentProvider: () => ({ dispose: () => { } }),
            canHandleResource: () => false,
        };
    }
    function createMockWorkspaceService() {
        const folderUri = URI.parse('file:///test');
        const folder = {
            uri: folderUri,
            toResource: (relativePath) => URI.parse(`file:///test/${relativePath}`),
        };
        return {
            _serviceBrand: undefined,
            getWorkspace: () => ({ folders: [folder] }),
            getWorkspaceFolder: (uri) => {
                if (uri.toString().startsWith(folderUri.toString())) {
                    return folder;
                }
                return null;
            },
        };
    }
    function createMockChatService() {
        return {
            _serviceBrand: undefined,
            getSession: () => undefined,
        };
    }
    function createMockBulkEditService() {
        const appliedEdits = [];
        return {
            _serviceBrand: undefined,
            apply: async (edit) => {
                appliedEdits.push(edit);
                return { ariaSummary: '', isApplied: true };
            },
            appliedEdits,
        };
    }
    function createInvocation(parameters) {
        return { parameters };
    }
    const noopCountTokens = async () => 0;
    const noopProgress = { report() { } };
    function createMockLanguageService() {
        return { getLanguageName: (id) => id };
    }
    function createTool(textModelService, options) {
        return new RenameTool(langFeatures, createMockLanguageService(), textModelService, createMockWorkspaceService(), createMockChatService(), options?.bulkEditService ?? createMockBulkEditService());
    }
    setup(() => {
        langFeatures = new LanguageFeaturesService();
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('getToolData', () => {
        test('reports no providers when none registered', () => {
            const tool = disposables.add(createTool(createMockTextModelService(null)));
            assert.strictEqual(tool.getToolData(), undefined);
        });
        test('lists registered language ids', () => {
            const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            disposables.add(langFeatures.renameProvider.register('typescript', {
                provideRenameEdits: () => ({ edits: [] }),
            }));
            const data = tool.getToolData();
            assert.ok(data?.modelDescription.includes('typescript'));
        });
        test('reports all languages for wildcard', () => {
            const tool = disposables.add(createTool(createMockTextModelService(null)));
            disposables.add(langFeatures.renameProvider.register('*', {
                provideRenameEdits: () => ({ edits: [] }),
            }));
            const data = tool.getToolData();
            assert.ok(data?.modelDescription.includes('all languages'));
        });
    });
    suite('invoke', () => {
        test('returns error when no uri or filePath provided', async () => {
            const tool = disposables.add(createTool(createMockTextModelService(null)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', lineContent: 'MyClass' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Provide either'));
        });
        test('returns error when no rename provider available', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            // No rename provider registered
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('No rename provider'));
        });
        test('returns error when line content not found', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            disposables.add(langFeatures.renameProvider.register('typescript', {
                provideRenameEdits: () => ({ edits: [] }),
            }));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'nonexistent line' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Could not find line content'));
        });
        test('returns error when symbol not found in line', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            disposables.add(langFeatures.renameProvider.register('typescript', {
                provideRenameEdits: () => ({ edits: [] }),
            }));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'NotHere', newName: 'Something', uri: testUri.toString(), lineContent: 'function doSomething' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Could not find symbol'));
        });
        test('returns error when rename is rejected', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const provider = {
                provideRenameEdits: () => ({
                    edits: [],
                    rejectReason: 'Cannot rename this symbol',
                }),
            };
            disposables.add(langFeatures.renameProvider.register('typescript', provider));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Rename rejected'));
            assert.ok(getTextContent(result).includes('Cannot rename this symbol'));
        });
        test('returns error when rename produces no edits', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const provider = {
                provideRenameEdits: () => ({
                    edits: [],
                }),
            };
            disposables.add(langFeatures.renameProvider.register('typescript', provider));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('no edits'));
        });
        test('successful rename applies edits via bulk edit and reports result', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const otherUri = URI.parse('file:///test/other.ts');
            const edits = [
                makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
                makeEdit(testUri, new Range(4, 23, 4, 30), 'MyNewClass'),
                makeEdit(otherUri, new Range(5, 14, 5, 21), 'MyNewClass'),
            ];
            const provider = {
                provideRenameEdits: () => ({ edits }),
            };
            disposables.add(langFeatures.renameProvider.register('typescript', provider));
            const bulkEditService = createMockBulkEditService();
            const tool = disposables.add(createTool(createMockTextModelService(model), { bulkEditService }));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            const text = getTextContent(result);
            assert.ok(text.includes('Renamed'));
            assert.ok(text.includes('MyClass'));
            assert.ok(text.includes('MyNewClass'));
            assert.ok(text.includes('3 edits'));
            assert.ok(text.includes('2 files'));
            assert.strictEqual(bulkEditService.appliedEdits.length, 1);
            assert.strictEqual(bulkEditService.appliedEdits[0].edits.length, 3);
        });
        test('successful rename with single edit reports singular message', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const edits = [
                makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
            ];
            const provider = {
                provideRenameEdits: () => ({ edits }),
            };
            disposables.add(langFeatures.renameProvider.register('typescript', provider));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            const text = getTextContent(result);
            assert.ok(text.includes('1 edit'));
            assert.ok(text.includes('1 file'));
        });
        test('resolves filePath via workspace folders', async () => {
            const fileUri = URI.parse('file:///test/src/file.ts');
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, fileUri));
            const edits = [
                makeEdit(fileUri, new Range(1, 10, 1, 17), 'MyNewClass'),
            ];
            const provider = {
                provideRenameEdits: () => ({ edits }),
            };
            disposables.add(langFeatures.renameProvider.register('typescript', provider));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', filePath: 'src/file.ts', lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Renamed'));
        });
        test('result includes toolResultMessage', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const edits = [
                makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
            ];
            const provider = {
                provideRenameEdits: () => ({ edits }),
            };
            disposables.add(langFeatures.renameProvider.register('typescript', provider));
            const tool = disposables.add(createTool(createMockTextModelService(model)));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(result.toolResultMessage);
            const msg = result.toolResultMessage;
            assert.ok(msg.value.includes('Renamed'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lVG9vbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvdG9vbHMvcmVuYW1lVG9vbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDN0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUd0RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUc5RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2xFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLFNBQVMsY0FBYyxDQUFDLE1BQW1CO0lBQzFDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUE0QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQztJQUNyRixPQUFPLElBQUksRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQzFCLENBQUM7QUFFRCxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtJQUV4QixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQzFDLElBQUksWUFBcUMsQ0FBQztJQUUxQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDbEQsTUFBTSxXQUFXLEdBQUc7UUFDbkIsc0NBQXNDO1FBQ3RDLEVBQUU7UUFDRiwwQkFBMEI7UUFDMUIsbUNBQW1DO1FBQ25DLG1CQUFtQjtRQUNuQixHQUFHO0tBQ0gsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFYixTQUFTLFFBQVEsQ0FBQyxRQUFhLEVBQUUsS0FBWSxFQUFFLElBQVk7UUFDMUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO0lBQ3RFLENBQUM7SUFFRCxTQUFTLDBCQUEwQixDQUFDLEtBQWM7UUFDakQsT0FBTztZQUNOLGFBQWEsRUFBRSxTQUFTO1lBQ3hCLG9CQUFvQixFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDbEMsTUFBTSxFQUFFLEVBQUUsZUFBZSxFQUFFLEtBQUssRUFBRTtnQkFDbEMsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7YUFDbEIsQ0FBQztZQUNGLGdDQUFnQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDaEUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSztTQUNFLENBQUM7SUFDbkMsQ0FBQztJQUVELFNBQVMsMEJBQTBCO1FBQ2xDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDNUMsTUFBTSxNQUFNLEdBQUc7WUFDZCxHQUFHLEVBQUUsU0FBUztZQUNkLFVBQVUsRUFBRSxDQUFDLFlBQW9CLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLFlBQVksRUFBRSxDQUFDO1NBQ2hELENBQUM7UUFDakMsT0FBTztZQUNOLGFBQWEsRUFBRSxTQUFTO1lBQ3hCLFlBQVksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUMzQyxrQkFBa0IsRUFBRSxDQUFDLEdBQVEsRUFBRSxFQUFFO2dCQUNoQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDckQsT0FBTyxNQUFNLENBQUM7Z0JBQ2YsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7U0FDc0MsQ0FBQztJQUMxQyxDQUFDO0lBRUQsU0FBUyxxQkFBcUI7UUFDN0IsT0FBTztZQUNOLGFBQWEsRUFBRSxTQUFTO1lBQ3hCLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO1NBQ0EsQ0FBQztJQUM5QixDQUFDO0lBRUQsU0FBUyx5QkFBeUI7UUFDakMsTUFBTSxZQUFZLEdBQW9CLEVBQUUsQ0FBQztRQUN6QyxPQUFPO1lBQ04sYUFBYSxFQUFFLFNBQVM7WUFDeEIsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFtQixFQUE0QixFQUFFO2dCQUM5RCxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN4QixPQUFPLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDN0MsQ0FBQztZQUNELFlBQVk7U0FDdUQsQ0FBQztJQUN0RSxDQUFDO0lBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxVQUFtQztRQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFnQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxNQUFNLGVBQWUsR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN0QyxNQUFNLFlBQVksR0FBaUIsRUFBRSxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFFcEQsU0FBUyx5QkFBeUI7UUFDakMsT0FBTyxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQVUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFpQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxTQUFTLFVBQVUsQ0FBQyxnQkFBbUMsRUFBRSxPQUFnRDtRQUN4RyxPQUFPLElBQUksVUFBVSxDQUNwQixZQUFZLEVBQ1oseUJBQXlCLEVBQUUsRUFDM0IsZ0JBQWdCLEVBQ2hCLDBCQUEwQixFQUFFLEVBQzVCLHFCQUFxQixFQUFFLEVBQ3ZCLE9BQU8sRUFBRSxlQUFlLElBQUkseUJBQXlCLEVBQUUsQ0FDdkQsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsWUFBWSxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztJQUM5QyxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBRXpCLElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDdEQsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtZQUMxQyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3JGLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1RSxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRTtnQkFDbEUsa0JBQWtCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQzthQUN6QyxDQUFDLENBQUMsQ0FBQztZQUNKLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNoQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7WUFDL0MsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFO2dCQUN6RCxrQkFBa0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO2FBQ3pDLENBQUMsQ0FBQyxDQUFDO1lBQ0osTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQzdELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtRQUVwQixJQUFJLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDakUsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDL0IsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQ3RGLGVBQWUsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUNyRCxDQUFDO1lBQ0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzlGLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1RSxnQ0FBZ0M7WUFDaEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUMvQixnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQzFILGVBQWUsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUNyRCxDQUFDO1lBQ0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUNsRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1RCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzlGLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFO2dCQUNsRSxrQkFBa0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO2FBQ3pDLENBQUMsQ0FBQyxDQUFDO1lBQ0osTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDL0IsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxFQUN4SCxlQUFlLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FDckQsQ0FBQztZQUNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLENBQUM7UUFDM0UsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDOUQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM5RixXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRTtnQkFDbEUsa0JBQWtCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQzthQUN6QyxDQUFDLENBQUMsQ0FBQztZQUNKLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1RSxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQy9CLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFLENBQUMsRUFDM0gsZUFBZSxFQUFFLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQ3JELENBQUM7WUFDRixNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDOUYsTUFBTSxRQUFRLEdBQW1CO2dCQUNoQyxrQkFBa0IsRUFBRSxHQUE4QixFQUFFLENBQUMsQ0FBQztvQkFDckQsS0FBSyxFQUFFLEVBQUU7b0JBQ1QsWUFBWSxFQUFFLDJCQUEyQjtpQkFDekMsQ0FBQzthQUNGLENBQUM7WUFDRixXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1RSxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQy9CLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFDMUgsZUFBZSxFQUFFLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQ3JELENBQUM7WUFDRixNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7UUFDekUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDOUQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM5RixNQUFNLFFBQVEsR0FBbUI7Z0JBQ2hDLGtCQUFrQixFQUFFLEdBQThCLEVBQUUsQ0FBQyxDQUFDO29CQUNyRCxLQUFLLEVBQUUsRUFBRTtpQkFDVCxDQUFDO2FBQ0YsQ0FBQztZQUNGLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDOUUsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDL0IsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUMxSCxlQUFlLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FDckQsQ0FBQztZQUNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtFQUFrRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ25GLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDOUYsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sS0FBSyxHQUFHO2dCQUNiLFFBQVEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxDQUFDO2dCQUN4RCxRQUFRLENBQUMsT0FBTyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFlBQVksQ0FBQztnQkFDeEQsUUFBUSxDQUFDLFFBQVEsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUM7YUFDekQsQ0FBQztZQUNGLE1BQU0sUUFBUSxHQUFtQjtnQkFDaEMsa0JBQWtCLEVBQUUsR0FBOEIsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQzthQUNoRSxDQUFDO1lBQ0YsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUU5RSxNQUFNLGVBQWUsR0FBRyx5QkFBeUIsRUFBRSxDQUFDO1lBQ3BELE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWpHLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDL0IsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUMxSCxlQUFlLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FDckQsQ0FBQztZQUVGLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZEQUE2RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzlFLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDOUYsTUFBTSxLQUFLLEdBQUc7Z0JBQ2IsUUFBUSxDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUM7YUFDeEQsQ0FBQztZQUNGLE1BQU0sUUFBUSxHQUFtQjtnQkFDaEMsa0JBQWtCLEVBQUUsR0FBOEIsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQzthQUNoRSxDQUFDO1lBQ0YsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUU5RSxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUMvQixnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQzFILGVBQWUsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUNyRCxDQUFDO1lBRUYsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUN0RCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzlGLE1BQU0sS0FBSyxHQUFHO2dCQUNiLFFBQVEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxDQUFDO2FBQ3hELENBQUM7WUFDRixNQUFNLFFBQVEsR0FBbUI7Z0JBQ2hDLGtCQUFrQixFQUFFLEdBQThCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUM7YUFDaEUsQ0FBQztZQUNGLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFFOUUsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FDL0IsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUMxSCxlQUFlLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FDckQsQ0FBQztZQUVGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDOUYsTUFBTSxLQUFLLEdBQUc7Z0JBQ2IsUUFBUSxDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUM7YUFDeEQsQ0FBQztZQUNGLE1BQU0sUUFBUSxHQUFtQjtnQkFDaEMsa0JBQWtCLEVBQUUsR0FBOEIsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQzthQUNoRSxDQUFDO1lBQ0YsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUU5RSxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUMvQixnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQzFILGVBQWUsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUNyRCxDQUFDO1lBRUYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUNwQyxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsaUJBQW9DLENBQUM7WUFDeEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9