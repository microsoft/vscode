/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { LspCompletionProviderAddon } from '../../browser/lspCompletionProviderAddon.js';
import { LspTerminalModelContentProvider } from '../../browser/lspTerminalModelContentProvider.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IResolvedTextEditorModel } from '../../../../../../editor/common/services/resolverService.js';
import { CompletionItemProvider, CompletionList, CompletionItem, CompletionItemKind } from '../../../../../../editor/common/languages.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import * as sinon from 'sinon';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';

suite('LspCompletionProviderAddon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockProvider: CompletionItemProvider;
	let mockTextVirtualModel: { object: IResolvedTextEditorModel };
	let mockLspTerminalModelContentProvider: LspTerminalModelContentProvider;
	let addon: LspCompletionProviderAddon;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());

		// Create mock text model
		const mockTextModel = {
			getLineCount: sinon.stub().returns(1),
		} as unknown as ITextModel;

		// Create mock resolved text editor model
		mockTextVirtualModel = {
			object: {
				textEditorModel: mockTextModel,
			} as IResolvedTextEditorModel
		};

		// Create mock LSP terminal model content provider
		mockLspTerminalModelContentProvider = {
			trackPromptInputToVirtualFile: sinon.stub(),
		} as unknown as LspTerminalModelContentProvider;

		// Create mock completion provider
		mockProvider = {
			_debugDisplayName: 'test-provider',
			triggerCharacters: ['.'],
			provideCompletionItems: sinon.stub(),
		} as unknown as CompletionItemProvider;

		// Create the addon
		addon = store.add(new LspCompletionProviderAddon(
			mockProvider,
			mockTextVirtualModel,
			mockLspTerminalModelContentProvider
		));
	});

	test('should include documentation field when mapping LSP completion items', async () => {
		// Arrange
		const mockCompletionItems: CompletionItem[] = [
			{
				label: 'test_function',
				insertText: 'test_function',
				detail: 'A test function',
				documentation: 'This is a test function that does something useful.',
				kind: CompletionItemKind.Function,
			} as CompletionItem,
			{
				label: 'another_function',
				insertText: 'another_function',
				detail: 'Another function',
				documentation: new MarkdownString('**Another function** with *markdown* documentation.'),
				kind: CompletionItemKind.Method,
			} as CompletionItem
		];

		const mockCompletionList: CompletionList = {
			suggestions: mockCompletionItems,
		};

		(mockProvider.provideCompletionItems as sinon.SinonStub).resolves(mockCompletionList);

		// Act
		const result = await addon.provideCompletions('test_func', 9, false, CancellationToken.None);

		// Assert
		assert.ok(result);
		assert.ok(Array.isArray(result));
		assert.strictEqual(result.length, 2);

		// Check first completion item
		assert.strictEqual(result[0].label, 'test_function');
		assert.strictEqual(result[0].detail, 'A test function');
		assert.strictEqual(result[0].documentation, 'This is a test function that does something useful.');
		assert.strictEqual(result[0].provider, 'lsp:test-provider');

		// Check second completion item
		assert.strictEqual(result[1].label, 'another_function');
		assert.strictEqual(result[1].detail, 'Another function');
		assert.ok(result[1].documentation instanceof MarkdownString);
		assert.strictEqual(result[1].provider, 'lsp:test-provider');
	});

	test('should handle completion items without documentation', async () => {
		// Arrange
		const mockCompletionItems: CompletionItem[] = [
			{
				label: 'no_docs_function',
				insertText: 'no_docs_function',
				detail: 'Function without docs',
				kind: CompletionItemKind.Function,
				// No documentation field
			} as CompletionItem
		];

		const mockCompletionList: CompletionList = {
			suggestions: mockCompletionItems,
		};

		(mockProvider.provideCompletionItems as sinon.SinonStub).resolves(mockCompletionList);

		// Act
		const result = await addon.provideCompletions('no_docs', 7, false, CancellationToken.None);

		// Assert
		assert.ok(result);
		assert.ok(Array.isArray(result));
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].label, 'no_docs_function');
		assert.strictEqual(result[0].detail, 'Function without docs');
		assert.strictEqual(result[0].documentation, undefined);
		assert.strictEqual(result[0].provider, 'lsp:test-provider');
	});
});