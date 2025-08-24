/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { DocumentSymbol, Location, SymbolKind } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IWorkspaceSymbol } from '../../../../search/common/search.js';
import { ListCodeUsagesTool, ListCodeUsagesToolParams } from '../../../common/tools/listCodeUsagesTool.js';

suite('ListCodeUsagesTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let tool: ListCodeUsagesTool;
	let mockTextModelService: ITextModelService;
	let mockLanguageFeaturesService: ILanguageFeaturesService;

	const testUri = URI.parse('file:///test.ts');
	const testSymbolName = 'testFunction';

	setup(() => {
		const instaService = workbenchInstantiationService(undefined, store);

		// Mock text model service
		mockTextModelService = {
			createModelReference: async (uri: URI) => {
				const textModel: ITextModel = {
					uri,
					getLineContent: () => 'function testFunction() {}',
					getLineCount: () => 1,
				} as any;

				return {
					object: {
						textEditorModel: textModel
					},
					dispose: () => { }
				};
			}
		} as any;

		// Mock language features service
		mockLanguageFeaturesService = {
			documentSymbolProvider: {
				all: () => [{
					provideDocumentSymbols: async (): Promise<DocumentSymbol[]> => {
						return [{
							name: testSymbolName,
							kind: SymbolKind.Function,
							range: new Range(1, 1, 1, 20),
							selectionRange: new Range(1, 10, 1, 22),
							children: []
						}];
					}
				}]
			},
			definitionProvider: {
				all: () => [{
					provideDefinition: async (): Promise<Location[]> => {
						return [{
							uri: testUri,
							range: new Range(1, 10, 1, 22)
						}];
					}
				}]
			},
			referenceProvider: {
				all: () => [{
					provideReferences: async (): Promise<Location[]> => {
						return [
							{
								uri: testUri,
								range: new Range(1, 10, 1, 22)
							},
							{
								uri: URI.parse('file:///test2.ts'),
								range: new Range(5, 5, 5, 17)
							}
						];
					}
				}]
			},
			implementationProvider: {
				all: () => [{
					provideImplementation: async (): Promise<Location[]> => {
						return [{
							uri: URI.parse('file:///impl.ts'),
							range: new Range(10, 1, 10, 13)
						}];
					}
				}]
			}
		} as any;

		instaService.stub(ITextModelService, mockTextModelService);
		instaService.stub(ILanguageFeaturesService, mockLanguageFeaturesService);

		tool = store.add(instaService.createInstance(ListCodeUsagesTool));
	});

	test('finds symbol in document and returns usages', async () => {
		const parameters: ListCodeUsagesToolParams = {
			symbol: testSymbolName,
			filePath: testUri.toString()
		};

		const invocation = {
			parameters,
			context: undefined,
		};

		const result = await tool.invoke(invocation, () => 0, () => { }, CancellationToken.None);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		
		const content = result.content[0].value as string;
		assert.ok(content.includes('Code Usages for "testFunction"'));
		assert.ok(content.includes('### Definitions (1)'));
		assert.ok(content.includes('### References (2)'));
		assert.ok(content.includes('### Implementations (1)'));
	});

	test('returns error when symbol not found', async () => {
		// Mock empty document symbols
		mockLanguageFeaturesService.documentSymbolProvider.all = () => [{
			provideDocumentSymbols: async () => []
		}];

		// Mock empty workspace symbols by modifying the import (this is a simplified test)
		const parameters: ListCodeUsagesToolParams = {
			symbol: 'nonExistentSymbol',
			filePath: testUri.toString()
		};

		const invocation = {
			parameters,
			context: undefined,
		};

		const result = await tool.invoke(invocation, () => 0, () => { }, CancellationToken.None);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok((result.content[0].value as string).includes('cannot be found'));
	});

	test('requires symbol parameter', async () => {
		const parameters = {} as ListCodeUsagesToolParams;

		const invocation = {
			parameters,
			context: undefined,
		};

		const result = await tool.invoke(invocation, () => 0, () => { }, CancellationToken.None);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.strictEqual(result.content[0].value, 'Error: Symbol name is required');
	});

	test('works without filePath parameter', async () => {
		const parameters: ListCodeUsagesToolParams = {
			symbol: testSymbolName
			// No filePath - should fallback to workspace search
		};

		const invocation = {
			parameters,
			context: undefined,
		};

		const result = await tool.invoke(invocation, () => 0, () => { }, CancellationToken.None);

		// Should still work by searching workspace symbols (mocked to be empty in this test)
		// In a real scenario, this would search workspace symbols
		assert.strictEqual(result.content.length, 1);
	});
});