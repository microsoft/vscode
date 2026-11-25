/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Handler } from '../../../../../editor/common/editorCommon.js';
import { DocumentFormattingEditProvider, TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { FormatOnType } from '../../../../../editor/contrib/format/browser/formatActions.js';
import { createTestCodeEditor, ITestCodeEditor, withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestEditorWorkerService } from '../../../../../editor/test/common/services/testEditorWorkerService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import '../../browser/formatActionsMultiple.js';

const IEditorCancellationTokens = createDecorator<{ add(): () => void }>('IEditorCancelService');

suite('Format Actions Multiple', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects formatter argument case-insensitively', async () => {
		const invokedFormatters: string[] = [];
		const serviceCollection = new ServiceCollection(
			[IContextKeyService, new class extends MockContextKeyService {
				override contextMatchesRules(): boolean {
					return true;
				}
			}],
			[IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }],
			[IEditorCancellationTokens, { add: () => () => { } }],
		);

		await withAsyncTestCodeEditor('const value = 1;', { serviceCollection }, async (editor, _viewModel, instantiationService) => {
			const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
			const createProvider = (extensionId: string): DocumentFormattingEditProvider => ({
				extensionId: new ExtensionIdentifier(extensionId),
				provideDocumentFormattingEdits: () => {
					invokedFormatters.push(extensionId);
					return [];
				}
			});

			editor.registerDisposable(languageFeaturesService.documentFormattingEditProvider.register('*', createProvider('publisher.first')));
			editor.registerDisposable(languageFeaturesService.documentFormattingEditProvider.register('*', createProvider('publisher.requested')));

			const command = CommandsRegistry.getCommand('editor.action.formatDocument.multiple');
			assert.ok(command);

			await instantiationService.invokeFunction(command.handler, { formatter: 'PUBLISHER.REQUESTED' });
		});

		assert.deepStrictEqual(invokedFormatters, ['publisher.requested']);
	});
});

suite('Format On Type', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let editor: ITestCodeEditor;
	let originalModel: ITextModel;
	let nextModel: ITextModel;
	let response: DeferredPromise<TextEdit[]>;
	let token: CancellationToken;

	setup(() => {
		response = new DeferredPromise<TextEdit[]>();
		token = CancellationToken.None;
		const serviceCollection = new ServiceCollection(
			[IEditorWorkerService, new class extends TestEditorWorkerService {
				override async computeMoreMinimalEdits(_resource: URI, edits: TextEdit[] | null | undefined) {
					return edits ?? undefined;
				}
			}],
			[IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
				override async playSignal(): Promise<void> { }
			}],
		);
		originalModel = store.add(createTextModel('const x=1\nnext'));
		nextModel = store.add(createTextModel('const value=2;'));
		editor = store.add(createTestCodeEditor(originalModel, { formatOnType: true, serviceCollection }));
		editor.registerDisposable(editor.invokeWithinContext(accessor => accessor.get(ILanguageFeaturesService).onTypeFormattingEditProvider.register('*', {
			autoFormatTriggerCharacters: [';'],
			provideOnTypeFormattingEdits: (_model, _position, _ch, _options, requestToken) => {
				token = requestToken;
				return response.p;
			},
		})));
		editor.registerAndInstantiateContribution(FormatOnType.ID, FormatOnType);
		editor.setPosition({ lineNumber: 1, column: 10 });
		editor.trigger('keyboard', Handler.Type, { text: ';' });
	});

	async function completeFormatting() {
		const cancelled = token.isCancellationRequested;
		await response.complete([
			{ range: new Range(1, 8, 1, 8), text: ' ' },
			{ range: new Range(1, 9, 1, 9), text: ' ' },
		]);
		await timeout(0);
		return { original: originalModel.getValue(), next: nextModel.getValue(), cancelled };
	}

	test('applies pending edits when the model is unchanged', async () => {
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const x = 1;\nnext',
			next: 'const value=2;',
			cancelled: false,
		});
	});

	test('does not apply pending edits to a different model', async () => {
		editor.setModel(nextModel);
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const x=1;\nnext',
			next: 'const value=2;',
			cancelled: true,
		});
	});

	test('does not apply pending edits after switching back to the original model', async () => {
		editor.setModel(nextModel);
		originalModel.applyEdits([{ range: new Range(1, 7, 1, 8), text: 'value' }]);
		editor.setModel(originalModel);
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const value=1;\nnext',
			next: 'const value=2;',
			cancelled: true,
		});
	});

	test('cancels pending edits when the editor is disposed', async () => {
		editor.dispose();
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const x=1;\nnext',
			next: 'const value=2;',
			cancelled: true,
		});
	});

	test('cancels pending edits when format on type is disabled', async () => {
		editor.updateOptions({ formatOnType: false });
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const x=1;\nnext',
			next: 'const value=2;',
			cancelled: true,
		});
	});

	test('cancels pending edits after typing on the trigger line', async () => {
		editor.trigger('keyboard', Handler.Type, { text: ' ' });
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const x=1; \nnext',
			next: 'const value=2;',
			cancelled: true,
		});
	});

	test('preserves pending edits after changes below the trigger line', async () => {
		editor.executeEdits('test', [{ range: new Range(2, 1, 2, 5), text: 'changed' }]);
		assert.deepStrictEqual(await completeFormatting(), {
			original: 'const x = 1;\nchanged',
			next: 'const value=2;',
			cancelled: false,
		});
	});
});
