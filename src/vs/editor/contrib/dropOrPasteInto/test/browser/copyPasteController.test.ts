/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getActiveElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { HierarchicalKind } from '../../../../../base/common/hierarchicalKind.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryClipboardMetadataManager } from '../../../../browser/controller/editContext/clipboardUtils.js';
import { CoreNavigationCommands } from '../../../../browser/coreCommands.js';
import { PastePayload } from '../../../../browser/editorBrowser.js';
import { EditorExtensionsRegistry } from '../../../../browser/editorExtensions.js';
import { IBulkEditService } from '../../../../browser/services/bulkEditService.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption, IEditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Handler } from '../../../../common/editorCommon.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { FormattingConflicts } from '../../../format/browser/format.js';
import '../../../format/browser/formatActions.js';
import { TestCommandService } from '../../../../test/browser/editorTestServices.js';
import { createCodeEditorServices } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';
import { CopyPasteController } from '../../browser/copyPasteController.js';

suite('Editor clipboard - column selections', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		InMemoryClipboardMetadataManager.INSTANCE.get('');
	});

	function createEditor(editContext: boolean, isSimpleWidget: boolean, options: IEditorOptions = {}) {
		const previousFocus = getActiveElement();
		const container = $('.test-clipboard-editor');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => {
			container.remove();
			if (previousFocus instanceof HTMLElement) {
				previousFocus.focus();
			}
		}));
		const cancellationService = getSingletonServiceDescriptors().find(([id]) => id.toString() === 'IEditorCancelService');
		assert.ok(cancellationService);
		const instantiationService = createCodeEditorServices(store, new ServiceCollection(cancellationService));
		instantiationService.stub(ICommandService, new TestCommandService(instantiationService));
		const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
			editContext,
			dimension: { width: 600, height: 400 },
			...options
		}, { isSimpleWidget, contributions: [] }));
		store.add(CommandsRegistry.registerCommand(Handler.Paste, (_accessor, payload: PastePayload) => {
			editor.trigger('keyboard', Handler.Paste, payload);
		}));

		const model = store.add(instantiateTextModel(instantiationService, '<AA>\n<BB>\n<CC>'));
		editor.setModel(model);
		editor.focus();
		const input = container.querySelector<HTMLElement>(editContext ? '.native-edit-context' : 'textarea.inputarea');
		assert.ok(input);
		assert.strictEqual(editor.getOption(EditorOption.effectiveEditContext), editContext);
		return { editor, model, input, instantiationService };
	}

	function copyColumn(editor: CodeEditorWidget, input: HTMLElement): DataTransfer {
		editor.setPosition(new Position(1, 2));
		CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(editor._getViewModel()!, {
			position: new Position(3, 4),
			viewPosition: new Position(3, 4),
			mouseColumn: 4,
			doColumnSelect: true
		});
		const clipboardData = new DataTransfer();
		input.dispatchEvent(new ClipboardEvent('copy', { clipboardData, cancelable: true }));
		return clipboardData;
	}

	for (const editContext of [false, true]) {
		const backend = editContext ? 'native EditContext' : 'textarea';
		const testBackend = editContext && !Object.hasOwn(mainWindow, 'EditContext') ? test.skip : test;

		for (const isSimpleWidget of [false, true]) {
			testBackend(`${backend}: copy and paste through the ${isSimpleWidget ? 'simple widget' : 'command service'}`, () => {
				const { editor, model, input } = createEditor(editContext, isSimpleWidget);
				const clipboardData = copyColumn(editor, input);
				InMemoryClipboardMetadataManager.INSTANCE.get('');
				model.setValue('left--right\nleft--right\nleft--right');
				editor.setPosition(new Position(1, 5));
				input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
				assert.deepStrictEqual(model.getLinesContent(), ['leftAA--right', 'leftBB--right', 'leftCC--right']);
			});
		}

		for (const columnSelectionPaste of ['block', 'text'] as const) {
			testBackend(`${backend}: ${columnSelectionPaste} mode controls format-on-paste`, async () => {
				const { editor, model, input, instantiationService } = createEditor(editContext, true, { columnSelectionPaste });
				const [formatContribution] = EditorExtensionsRegistry.getSomeEditorContributions(['editor.contrib.formatOnPaste']);
				assert.ok(formatContribution);
				store.add(instantiationService.createInstance(formatContribution.ctor, editor));
				let formattingRequests = 0;
				store.add(FormattingConflicts.setFormatterSelector(async () => {
					formattingRequests++;
					return undefined;
				}));
				store.add(instantiationService.get(ILanguageFeaturesService).documentRangeFormattingEditProvider.register('*', {
					provideDocumentRangeFormattingEdits: async () => []
				}));
				editor.updateOptions({ formatOnPaste: true });
				const clipboardData = copyColumn(editor, input);
				model.setValue('left--right\nleft--right\nleft--right');
				editor.setPosition(new Position(1, 5));
				input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
				await Promise.resolve();
				assert.strictEqual(formattingRequests, columnSelectionPaste === 'block' ? 0 : 1);
			});

			for (const metadataKind of ['editor', 'provider'] as const) {
				testBackend(`${backend}: ${columnSelectionPaste} mode with ${metadataKind} metadata and paste providers`, async () => {
					const { editor, model, input, instantiationService } = createEditor(editContext, true, { columnSelectionPaste });
					instantiationService.stub(IBulkEditService, new class extends mock<IBulkEditService>() { });
					instantiationService.stub(IProgressService, new class extends mock<IProgressService>() { });
					instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { });
					const controller = store.add(instantiationService.createInstance(CopyPasteController, editor));
					let providerCalls = 0;
					store.add(instantiationService.get(ILanguageFeaturesService).documentPasteEditProvider.register('*', {
						id: 'test-paste-provider',
						copyMimeTypes: [],
						pasteMimeTypes: ['text/plain'],
						providedPasteEditKinds: [new HierarchicalKind('test')],
						provideDocumentPasteEdits: async () => {
							providerCalls++;
							return undefined;
						}
					}));

					const clipboardData = copyColumn(editor, input);
					clipboardData.clearData(metadataKind === 'editor' ? 'application/vnd.code.copymetadata' : 'vscode-editor-data');
					InMemoryClipboardMetadataManager.INSTANCE.get('');
					model.setValue('left--right\nleft--right\nleft--right');
					editor.setPosition(new Position(1, 5));
					input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
					await controller.finishedPaste();

					assert.deepStrictEqual({ text: model.getLinesContent(), providerCalls }, columnSelectionPaste === 'block' ? {
						text: ['leftAA--right', 'leftBB--right', 'leftCC--right'],
						providerCalls: 0
					} : {
						text: ['leftAA', 'BB', 'CC--right', 'left--right', 'left--right'],
						providerCalls: 1
					});
				});
			}
		}
	}
});
