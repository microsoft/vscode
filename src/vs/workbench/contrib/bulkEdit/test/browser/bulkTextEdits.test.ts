/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createStringDataTransferItem, VSDataTransfer } from '../../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../../base/common/hierarchicalKind.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBulkEditOptions, IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { DocumentPasteEditProvider, WorkspaceEdit } from '../../../../../editor/common/languages.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextModelEditSourceMetadata } from '../../../../../editor/common/textModelEditSource.js';
import { CopyPasteController } from '../../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Progress, IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { BulkTextEdits } from '../../browser/bulkTextEdits.js';

suite('BulkTextEdits', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('paste edits report the paste edit source to model listeners', async () => {
		await withAsyncTestCodeEditor('', { pasteAs: { enabled: true, showPasteSelector: 'afterPaste' } }, async (editor, _viewModel, instantiationService) => {
			editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
			instantiationService.stub(createDecorator<{ add(): () => void }>('IEditorCancelService'), { add: () => () => { } });
			let selectEdit: ((index: number) => Promise<void>) | undefined;
			instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
				override show: IActionWidgetService['show'] = (_user, _preview, items, delegate) => {
					selectEdit = async index => { await delegate.onSelect(items[index].item!); };
				};
				override hide() { }
			});
			instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
				override async createModelReference() {
					return { object: { textEditorModel: editor.getModel() } as IResolvedTextEditorModel, dispose: () => { } };
				}
			});
			instantiationService.stub(IEditorWorkerService, new class extends mock<IEditorWorkerService>() {
				override async computeMoreMinimalEdits() {
					return undefined;
				}
			});
			instantiationService.stub(IBulkEditService, new class extends mock<IBulkEditService>() {
				override async apply(edit: ResourceEdit[] | WorkspaceEdit, options?: IBulkEditOptions) {
					const textEdits = (Array.isArray(edit) ? edit : ResourceEdit.convert(edit)).filter(edit => edit instanceof ResourceTextEdit);
					const bulkEdit = instantiationService.createInstance(BulkTextEdits, '', '', options?.editor, new UndoRedoGroup(), undefined, Progress.None, CancellationToken.None, textEdits);
					await bulkEdit.apply(options?.reason);
					return { isApplied: true, ariaSummary: '' };
				}
			});
			instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { });
			instantiationService.stub(IProgressService, new class extends mock<IProgressService>() { });

			const reasons: ITextModelEditSourceMetadata[] = [];
			disposables.add(editor.getModel().onDidChangeContent(e => {
				if (!e.isUndoing) {
					reasons.push(...e.detailedReasons.map(reason => reason.metadata));
				}
			}));

			const plainKind = new HierarchicalKind('text.plain');
			const provider: DocumentPasteEditProvider = {
				copyMimeTypes: [],
				pasteMimeTypes: ['text/plain'],
				providedPasteEditKinds: [plainKind],
				async provideDocumentPasteEdits() {
					return {
						edits: [
							{ title: 'Plain text', insertText: 'PLAIN', kind: plainKind },
							{ title: 'Other', insertText: 'OTHER', kind: new HierarchicalKind('other') }
						],
						dispose: () => { }
					};
				}
			};
			const controller = disposables.add(instantiationService.createInstance(CopyPasteController, editor));
			const dataTransfer = new VSDataTransfer();
			dataTransfer.append('text/plain', createStringDataTransferItem('PLAIN'));
			// The test editor has no clipboard view, so start the inline paste directly.
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
			controller['doPasteInline']([provider], editor.getSelections(), dataTransfer, undefined, undefined);
			await controller.finishedPaste();

			controller.changePasteType();
			assert.ok(selectEdit);
			await selectEdit(1);
			controller.clearWidgets();

			const pasteReason = { source: 'cursor', kind: 'paste', detailedSource: 'pasteEdit' };
			assert.deepStrictEqual({ text: editor.getValue(), reasons }, { text: 'OTHER', reasons: [pasteReason, pasteReason] });
		});
	});
});
