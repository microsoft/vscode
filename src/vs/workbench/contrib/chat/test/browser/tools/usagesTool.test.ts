/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { DefinitionProvider, ImplementationProvider, Location, ReferenceProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { UsagesTool, UsagesToolId } from '../../../browser/tools/usagesTool.js';
import { IToolInvocation, IToolResult, IToolResultTextPart, ToolProgress } from '../../../common/tools/languageModelToolsService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

function getTextContent(result: IToolResult): string {
	const part = result.content.find((p): p is IToolResultTextPart => p.kind === 'text');
	return part?.value ?? '';
}

suite('UsagesTool', () => {

	const disposables = new DisposableStore();
	let langFeatures: LanguageFeaturesService;

	const testUri = URI.parse('file:///test/file.ts');
	const testContent = [
		'import { MyClass } from "./myClass";',
		'',
		'function doSomething() {',
		'\tconst instance = new MyClass();',
		'\tinstance.run();',
		'}',
	].join('\n');

	function createMockTextModelService(model: ITextModel): ITextModelService {
		return {
			_serviceBrand: undefined,
			createModelReference: async () => ({
				object: { textEditorModel: model },
				dispose: () => { },
			}),
			registerTextModelContentProvider: () => ({ dispose: () => { } }),
			canHandleResource: () => false,
		} as unknown as ITextModelService;
	}

	function createMockWorkspaceService(): IWorkspaceContextService {
		const folder = {
			uri: URI.parse('file:///test'),
			toResource: (relativePath: string) => URI.parse(`file:///test/${relativePath}`),
		} as unknown as IWorkspaceFolder;
		return {
			_serviceBrand: undefined,
			getWorkspace: () => ({ folders: [folder] }),
		} as unknown as IWorkspaceContextService;
	}

	function createInvocation(parameters: Record<string, unknown>): IToolInvocation {
		return { parameters } as unknown as IToolInvocation;
	}

	const noopCountTokens = async () => 0;
	const noopProgress: ToolProgress = { report() { } };

	setup(() => {
		langFeatures = new LanguageFeaturesService();
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getToolData', () => {

		test('reports no providers when none registered', () => {
			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(null!), createMockWorkspaceService()));
			const data = tool.getToolData();
			assert.strictEqual(data.id, UsagesToolId);
			assert.ok(data.modelDescription.includes('No languages currently have reference providers'));
		});

		test('lists registered language ids', () => {
			const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(model), createMockWorkspaceService()));
			disposables.add(langFeatures.referenceProvider.register('typescript', { provideReferences: () => [] }));
			const data = tool.getToolData();
			assert.ok(data.modelDescription.includes('typescript'));
		});

		test('reports all languages for wildcard', () => {
			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(null!), createMockWorkspaceService()));
			disposables.add(langFeatures.referenceProvider.register('*', { provideReferences: () => [] }));
			const data = tool.getToolData();
			assert.ok(data.modelDescription.includes('all languages'));
		});
	});

	suite('invoke', () => {

		test('returns error when no uri or filePath provided', async () => {
			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(null!), createMockWorkspaceService()));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', lineContent: 'MyClass' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Provide either'));
		});

		test('returns error when line content not found', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			disposables.add(langFeatures.referenceProvider.register('typescript', { provideReferences: () => [] }));
			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(model), createMockWorkspaceService()));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', uri: testUri.toString(), lineContent: 'nonexistent line' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Could not find line content'));
		});

		test('returns error when symbol not found in line', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			disposables.add(langFeatures.referenceProvider.register('typescript', { provideReferences: () => [] }));
			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(model), createMockWorkspaceService()));
			const result = await tool.invoke(
				createInvocation({ symbol: 'NotHere', uri: testUri.toString(), lineContent: 'function doSomething' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Could not find symbol'));
		});

		test('finds references and classifies them', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));

			const refProvider: ReferenceProvider = {
				provideReferences: (_model: ITextModel): Location[] => [
					{ uri: testUri, range: new Range(1, 10, 1, 17) },
					{ uri: testUri, range: new Range(4, 23, 4, 30) },
				]
			};
			const defProvider: DefinitionProvider = {
				provideDefinition: () => [{ uri: testUri, range: new Range(1, 10, 1, 17) }]
			};
			const implProvider: ImplementationProvider = {
				provideImplementation: () => []
			};

			disposables.add(langFeatures.referenceProvider.register('typescript', refProvider));
			disposables.add(langFeatures.definitionProvider.register('typescript', defProvider));
			disposables.add(langFeatures.implementationProvider.register('typescript', implProvider));

			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(model), createMockWorkspaceService()));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			const text = getTextContent(result);
			assert.ok(text.includes('2 usages'));
			assert.ok(text.includes('[definition]'));
			assert.ok(text.includes('[reference]'));
		});

		test('handles whitespace normalization in lineContent', async () => {
			const content = 'function   doSomething(x:  number) {}';
			const model = disposables.add(createTextModel(content, 'typescript', undefined, testUri));

			disposables.add(langFeatures.referenceProvider.register('typescript', {
				provideReferences: (): Location[] => [
					{ uri: testUri, range: new Range(1, 12, 1, 23) },
				]
			}));

			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(model), createMockWorkspaceService()));
			const result = await tool.invoke(
				createInvocation({ symbol: 'doSomething', uri: testUri.toString(), lineContent: 'function doSomething(x: number)' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.ok(getTextContent(result).includes('1 usages'));
		});

		test('resolves filePath via workspace folders', async () => {
			const fileUri = URI.parse('file:///test/src/file.ts');
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, fileUri));

			disposables.add(langFeatures.referenceProvider.register('typescript', {
				provideReferences: (): Location[] => [
					{ uri: fileUri, range: new Range(1, 10, 1, 17) },
				]
			}));

			const tool = disposables.add(new UsagesTool(langFeatures, createMockTextModelService(model), createMockWorkspaceService()));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', filePath: 'src/file.ts', lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.ok(getTextContent(result).includes('1 usages'));
		});
	});
});
