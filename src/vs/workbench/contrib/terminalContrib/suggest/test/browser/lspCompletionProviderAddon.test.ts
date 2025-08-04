/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { LspCompletionProviderAddon } from '../../browser/lspCompletionProviderAddon.js';
import { LspTerminalModelContentProvider } from '../../browser/lspTerminalModelContentProvider.js';
import { GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { CompletionItemProvider, CompletionTriggerKind } from '../../../../../../editor/common/languages.js';
import { IResolvedTextEditorModel } from '../../../../../../editor/common/services/resolverService.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('LspCompletionProviderAddon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let mockProvider: CompletionItemProvider;
	let mockTextVirtualModel: IReference<IResolvedTextEditorModel>;
	let mockLspTerminalModelContentProvider: LspTerminalModelContentProvider;
	let addon: LspCompletionProviderAddon;
	let mockTextModel: ITextModel;

	setup(() => {
		// Create mock text model
		mockTextModel = {
			getLineCount: sinon.stub().returns(1),
			getValue: sinon.stub().returns(''),
			setValue: sinon.stub()
		} as unknown as ITextModel;

		// Create mock provider
		mockProvider = {
			_debugDisplayName: 'test-provider',
			triggerCharacters: ['.', '('],
			provideCompletionItems: sinon.stub().resolves({
				suggestions: [
					{
						label: 'test_suggestion',
						detail: 'Test detail',
						documentation: 'Test documentation',
						kind: 1 // Method
					}
				]
			})
		} as unknown as CompletionItemProvider;

		// Create mock text virtual model
		mockTextVirtualModel = {
			object: {
				textEditorModel: mockTextModel
			},
			dispose: sinon.stub()
		} as unknown as IReference<IResolvedTextEditorModel>;

		// Create mock LSP terminal model content provider
		mockLspTerminalModelContentProvider = {
			trackPromptInputToVirtualFile: sinon.stub(),
			get shellType() { return GeneralShellType.Python; }
		} as unknown as LspTerminalModelContentProvider;

		addon = store.add(new LspCompletionProviderAddon(
			mockProvider,
			mockTextVirtualModel,
			mockLspTerminalModelContentProvider
		));
	});

	teardown(() => {
		sinon.restore();
	});

	test('should provide completions when shell type is Python', async () => {
		const result = await addon.provideCompletions('print', 5, false, CancellationToken.None);
		
		assert.ok(result, 'Should return completions');
		assert.ok(Array.isArray(result), 'Should return an array of completions');
		assert.strictEqual((result as any[]).length, 1, 'Should return one completion');
		assert.strictEqual((result as any[])[0].label, 'test_suggestion', 'Should return the expected completion');
	});

	test('should NOT provide completions when shell type is not Python', async () => {
		// Override the shell type getter to return non-Python shell type
		sinon.stub(mockLspTerminalModelContentProvider, 'shellType').get(() => GeneralShellType.PowerShell);

		const result = await addon.provideCompletions('Get-', 4, false, CancellationToken.None);
		
		assert.strictEqual(result, undefined, 'Should return undefined when shell type is not Python');
	});

	test('should NOT provide completions when shell type is undefined', async () => {
		// Override the shell type getter to return undefined
		sinon.stub(mockLspTerminalModelContentProvider, 'shellType').get(() => undefined);

		const result = await addon.provideCompletions('ls', 2, false, CancellationToken.None);
		
		assert.strictEqual(result, undefined, 'Should return undefined when shell type is undefined');
	});

	test('should update behavior when shell type changes from Python to non-Python', async () => {
		// Initially provide completions when shell type is Python
		let result = await addon.provideCompletions('print', 5, false, CancellationToken.None);
		assert.ok(result, 'Should initially provide completions for Python');

		// Change shell type to bash
		sinon.stub(mockLspTerminalModelContentProvider, 'shellType').get(() => undefined);

		// Should no longer provide completions
		result = await addon.provideCompletions('ls', 2, false, CancellationToken.None);
		assert.strictEqual(result, undefined, 'Should not provide completions after shell type change');
	});
});