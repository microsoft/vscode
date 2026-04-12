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
import { FileMatch, OneLineRange, TextSearchMatch } from '../../../../../services/search/common/search.js';
import { UsagesTool } from '../../../browser/tools/usagesTool.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
function getTextContent(result) {
    const part = result.content.find((p) => p.kind === 'text');
    return part?.value ?? '';
}
suite('UsagesTool', () => {
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
    function createMockModelService(models) {
        return {
            _serviceBrand: undefined,
            getModel: (uri) => models?.find(m => m.uri.toString() === uri.toString()) ?? null,
        };
    }
    function createMockSearchService(searchImpl) {
        return {
            _serviceBrand: undefined,
            textSearch: async (query) => searchImpl?.(query) ?? { results: [], messages: [] },
        };
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
    function createInvocation(parameters) {
        return { parameters };
    }
    const noopCountTokens = async () => 0;
    const noopProgress = { report() { } };
    function createMockLanguageService() {
        return { getLanguageName: (id) => id };
    }
    function createTool(textModelService, workspaceService, options) {
        return new UsagesTool(langFeatures, createMockLanguageService(), options?.modelService ?? createMockModelService(), options?.searchService ?? createMockSearchService(), textModelService, workspaceService);
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
            const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
            assert.strictEqual(tool.getToolData(), undefined);
        });
        test('lists registered language ids', () => {
            const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
            disposables.add(langFeatures.referenceProvider.register('typescript', { provideReferences: () => [] }));
            const data = tool.getToolData();
            assert.ok(data?.modelDescription.includes('typescript'));
        });
        test('reports all languages for wildcard', () => {
            const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
            disposables.add(langFeatures.referenceProvider.register('*', { provideReferences: () => [] }));
            const data = tool.getToolData();
            assert.ok(data?.modelDescription.includes('all languages'));
        });
    });
    suite('invoke', () => {
        test('returns error when no uri or filePath provided', async () => {
            const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', lineContent: 'MyClass' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Provide either'));
        });
        test('returns error when line content not found', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            disposables.add(langFeatures.referenceProvider.register('typescript', { provideReferences: () => [] }));
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', uri: testUri.toString(), lineContent: 'nonexistent line' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Could not find line content'));
        });
        test('returns error when symbol not found in line', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            disposables.add(langFeatures.referenceProvider.register('typescript', { provideReferences: () => [] }));
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
            const result = await tool.invoke(createInvocation({ symbol: 'NotHere', uri: testUri.toString(), lineContent: 'function doSomething' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('Could not find symbol'));
        });
        test('finds references and classifies them with usage tags', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const otherUri = URI.parse('file:///test/other.ts');
            const refProvider = {
                provideReferences: (_model) => [
                    { uri: testUri, range: new Range(1, 10, 1, 17) },
                    { uri: testUri, range: new Range(4, 23, 4, 30) },
                    { uri: otherUri, range: new Range(5, 1, 5, 8) },
                ]
            };
            const defProvider = {
                provideDefinition: () => [{ uri: testUri, range: new Range(1, 10, 1, 17) }]
            };
            const implProvider = {
                provideImplementation: () => [{ uri: otherUri, range: new Range(5, 1, 5, 8) }]
            };
            disposables.add(langFeatures.referenceProvider.register('typescript', refProvider));
            disposables.add(langFeatures.definitionProvider.register('typescript', defProvider));
            disposables.add(langFeatures.implementationProvider.register('typescript', implProvider));
            // Model is open for testUri so IModelService returns it; otherUri needs search
            const searchCalled = [];
            const searchService = createMockSearchService(query => {
                searchCalled.push(query);
                const fileMatch = new FileMatch(otherUri);
                fileMatch.results = [new TextSearchMatch('export class MyClass implements IMyClass {', new OneLineRange(4, 0, 7) // 0-based line 4 = 1-based line 5
                    )];
                return { results: [fileMatch], messages: [] };
            });
            const modelService = createMockModelService([model]);
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { modelService, searchService }));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            const text = getTextContent(result);
            // Check overall structure
            assert.ok(text.includes('3 usages of `MyClass`'));
            // Check usage tag format
            assert.ok(text.includes(`<usage type="definition" uri="${testUri.toString()}" line="1">`));
            assert.ok(text.includes(`<usage type="reference" uri="${testUri.toString()}" line="4">`));
            assert.ok(text.includes(`<usage type="implementation" uri="${otherUri.toString()}" line="5">`));
            // Check that previews from open model are included (testUri lines)
            assert.ok(text.includes('import { MyClass } from "./myClass"'));
            assert.ok(text.includes('const instance = new MyClass()'));
            // Check that preview from search service is included (otherUri)
            assert.ok(text.includes('export class MyClass implements IMyClass {'));
            // Check closing tags
            assert.ok(text.includes('</usage>'));
            // Verify search service was called for the non-open file
            assert.strictEqual(searchCalled.length, 1);
            assert.ok(searchCalled[0].contentPattern.pattern.includes('MyClass'));
            assert.ok(searchCalled[0].contentPattern.isWordMatch);
        });
        test('uses self-closing tag when no preview available', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            const otherUri = URI.parse('file:///test/other.ts');
            disposables.add(langFeatures.referenceProvider.register('typescript', {
                provideReferences: () => [
                    { uri: otherUri, range: new Range(10, 5, 10, 12) },
                ]
            }));
            // Search returns no results for this file (symbol renamed/aliased)
            const searchService = createMockSearchService(() => ({ results: [], messages: [] }));
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { searchService }));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            const text = getTextContent(result);
            assert.ok(text.includes(`<usage type="reference" uri="${otherUri.toString()}" line="10" />`));
        });
        test('does not call search service for files already open in model service', async () => {
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
            disposables.add(langFeatures.referenceProvider.register('typescript', {
                provideReferences: () => [
                    { uri: testUri, range: new Range(1, 10, 1, 17) },
                ]
            }));
            let searchCalled = false;
            const searchService = createMockSearchService(() => {
                searchCalled = true;
                return { results: [], messages: [] };
            });
            const modelService = createMockModelService([model]);
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { modelService, searchService }));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('1 usages'));
            assert.strictEqual(searchCalled, false, 'search service should not be called when all files are open');
        });
        test('handles whitespace normalization in lineContent', async () => {
            const content = 'function   doSomething(x:  number) {}';
            const model = disposables.add(createTextModel(content, 'typescript', undefined, testUri));
            disposables.add(langFeatures.referenceProvider.register('typescript', {
                provideReferences: () => [
                    { uri: testUri, range: new Range(1, 12, 1, 23) },
                ]
            }));
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
            const result = await tool.invoke(createInvocation({ symbol: 'doSomething', uri: testUri.toString(), lineContent: 'function doSomething(x: number)' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('1 usages'));
        });
        test('resolves filePath via workspace folders', async () => {
            const fileUri = URI.parse('file:///test/src/file.ts');
            const model = disposables.add(createTextModel(testContent, 'typescript', undefined, fileUri));
            disposables.add(langFeatures.referenceProvider.register('typescript', {
                provideReferences: () => [
                    { uri: fileUri, range: new Range(1, 10, 1, 17) },
                ]
            }));
            const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
            const result = await tool.invoke(createInvocation({ symbol: 'MyClass', filePath: 'src/file.ts', lineContent: 'import { MyClass }' }), noopCountTokens, noopProgress, CancellationToken.None);
            assert.ok(getTextContent(result).includes('1 usages'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2VzVG9vbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvdG9vbHMvdXNhZ2VzVG9vbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDN0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUd0RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUk5RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFeEYsT0FBTyxFQUFFLFNBQVMsRUFBK0MsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3hKLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxTQUFTLGNBQWMsQ0FBQyxNQUFtQjtJQUMxQyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBNEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUM7SUFDckYsT0FBTyxJQUFJLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUMxQixDQUFDO0FBRUQsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFFeEIsTUFBTSxXQUFXLEdB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