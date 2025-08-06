/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { LspCompletionProviderAddon } from '../../browser/lspCompletionProviderAddon.js';
import { LspTerminalModelContentProvider } from '../../browser/lspTerminalModelContentProvider.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import * as sinon from 'sinon';
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CompletionItemProvider, CompletionItemKind, CompletionItem } from '../../../../../../editor/common/languages.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { TerminalCompletionItemKind } from '../../browser/terminalCompletionItem.js';

suite('LspCompletionProviderAddon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockProvider: CompletionItemProvider;
	let mockTextModelService: ITextModelService;
	let mockModel: ITextModel;
	let mockModelRef: any;
	let lspTerminalModelContentProvider: LspTerminalModelContentProvider;
	let lspCompletionProviderAddon: LspCompletionProviderAddon;

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());

		// Mock text model
		mockModel = {
			getValue: sinon.stub().returns(''),
			setValue: sinon.stub(),
			getLineCount: sinon.stub().returns(1),
			dispose: sinon.stub(),
			isDisposed: sinon.stub().returns(false)
		} as unknown as ITextModel;

		// Mock model reference
		mockModelRef = {
			object: {
				textEditorModel: mockModel
			},
			dispose: sinon.stub()
		};

		// Mock text model service
		mockTextModelService = {
			createModelReference: sinon.stub().resolves(mockModelRef),
			registerTextModelContentProvider: sinon.stub().returns({ dispose: sinon.stub() })
		} as unknown as ITextModelService;

		// Mock LSP provider
		mockProvider = {
			_debugDisplayName: 'ms-python.python',
			provideCompletionItems: sinon.stub(),
			triggerCharacters: ['.']
		} as unknown as CompletionItemProvider;

		// Mock LSP terminal model content provider
		lspTerminalModelContentProvider = {
			trackPromptInputToVirtualFile: sinon.stub()
		} as unknown as LspTerminalModelContentProvider;

		// Create the addon
		lspCompletionProviderAddon = new LspCompletionProviderAddon(
			mockProvider,
			mockModelRef,
			lspTerminalModelContentProvider
		);
	});

	teardown(() => {
		sinon.restore();
	});

	test('should filter out shell commands from Python completions', async () => {
		// Arrange: Mock completion items that include shell commands
		const mockCompletionItems: CompletionItem[] = [
			{
				label: 'print',
				kind: CompletionItemKind.Method,
				detail: 'Built-in function'
			},
			{
				label: 'npm',
				kind: CompletionItemKind.Text,
				detail: 'Node package manager'
			},
			{
				label: 'addgnurhome',
				kind: CompletionItemKind.Text,
				detail: 'Shell command'
			},
			{
				label: 'len',
				kind: CompletionItemKind.Method,
				detail: 'Built-in function'
			}
		];

		(mockProvider.provideCompletionItems as sinon.SinonStub).resolves({
			suggestions: mockCompletionItems
		});

		// Act: Get completions
		const result = await lspCompletionProviderAddon.provideCompletions(
			'pri',
			3,
			false,
			CancellationToken.None
		);

		// Assert: Should only include Python-related completions, not shell commands
		assert(result);
		assert(Array.isArray(result));
		
		// Should contain valid Python completions
		const labels = result.map(item => item.label);
		assert(labels.includes('print'), 'Should include print function');
		assert(labels.includes('len'), 'Should include len function');
		
		// Should NOT contain shell commands
		assert(!labels.includes('npm'), 'Should not include npm command');
		assert(!labels.includes('addgnurhome'), 'Should not include shell commands');
	});

	test('should allow Python completions when they have appropriate kinds', async () => {
		// Arrange: Mock completion items with Python-appropriate kinds
		const mockCompletionItems: CompletionItem[] = [
			{
				label: 'print',
				kind: CompletionItemKind.Method,
				detail: 'Built-in function'
			},
			{
				label: 'my_variable',
				kind: CompletionItemKind.Variable,
				detail: 'Local variable'
			},
			{
				label: 'MyClass',
				kind: CompletionItemKind.Class,
				detail: 'User-defined class'
			}
		];

		(mockProvider.provideCompletionItems as sinon.SinonStub).resolves({
			suggestions: mockCompletionItems
		});

		// Act: Get completions
		const result = await lspCompletionProviderAddon.provideCompletions(
			'my',
			2,
			false,
			CancellationToken.None
		);

		// Assert: Should include all Python-appropriate completions
		assert(result);
		assert(Array.isArray(result));
		assert.strictEqual(result.length, 3, 'Should include all Python completions');
		
		const labels = result.map(item => item.label);
		assert(labels.includes('print'), 'Should include method');
		assert(labels.includes('my_variable'), 'Should include variable');
		assert(labels.includes('MyClass'), 'Should include class');
	});
});