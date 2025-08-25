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
				label: 'kernelophys-support',
				kind: CompletionItemKind.Text,
				detail: 'System tool'
			},
			{
				label: 'len',
				kind: CompletionItemKind.Method,
				detail: 'Built-in function'
			},
			{
				label: 'git',
				kind: CompletionItemKind.Variable,
				detail: 'Version control command'
			},
			{
				label: 'my_python_var',
				kind: CompletionItemKind.Variable,
				detail: 'Python variable'
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
		assert(labels.includes('my_python_var'), 'Should include Python variables');
		
		// Should NOT contain shell commands
		assert(!labels.includes('npm'), 'Should not include npm command');
		assert(!labels.includes('addgnurhome'), 'Should not include shell commands');
		assert(!labels.includes('kernelophys-support'), 'Should not include system tools');
		assert(!labels.includes('git'), 'Should not include git command');
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
			},
			{
				label: '__init__',
				kind: CompletionItemKind.Method,
				detail: 'Constructor method'
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
		assert.strictEqual(result.length, 4, 'Should include all Python completions');
		
		const labels = result.map(item => item.label);
		assert(labels.includes('print'), 'Should include method');
		assert(labels.includes('my_variable'), 'Should include variable');
		assert(labels.includes('MyClass'), 'Should include class');
		assert(labels.includes('__init__'), 'Should include dunder methods');
	});

	test('should not filter Python keywords or built-ins that might look like commands', async () => {
		// Arrange: Mock Python keywords and built-ins that could be confused with shell commands
		const mockCompletionItems: CompletionItem[] = [
			{
				label: 'int',
				kind: CompletionItemKind.Keyword,
				detail: 'Built-in type'
			},
			{
				label: 'str',
				kind: CompletionItemKind.Keyword,
				detail: 'Built-in type'
			},
			{
				label: 'import',
				kind: CompletionItemKind.Keyword,
				detail: 'Python keyword'
			},
			{
				label: 'pip-tools',  // This has a dash but should be allowed as it could be a Python module
				kind: CompletionItemKind.Module,
				detail: 'Python module'
			}
		];

		(mockProvider.provideCompletionItems as sinon.SinonStub).resolves({
			suggestions: mockCompletionItems
		});

		// Act: Get completions
		const result = await lspCompletionProviderAddon.provideCompletions(
			'i',
			1,
			false,
			CancellationToken.None
		);

		// Assert: Should include all legitimate Python completions
		assert(result);
		assert(Array.isArray(result));
		assert.strictEqual(result.length, 4, 'Should include all Python-related completions');
		
		const labels = result.map(item => item.label);
		assert(labels.includes('int'), 'Should include Python types');
		assert(labels.includes('str'), 'Should include Python types');
		assert(labels.includes('import'), 'Should include Python keywords');
		assert(labels.includes('pip-tools'), 'Should include Python modules even with dashes');
	});
});