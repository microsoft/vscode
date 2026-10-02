/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createStringDataTransferItem, VSDataTransfer } from '../../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../../base/common/hierarchicalKind.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../../../browser/services/bulkEditService.js';
import { DocumentPasteEditProvider, WorkspaceEdit } from '../../../../common/languages.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { SnippetParser } from '../../../snippet/browser/snippetParser.js';
import { CopyPasteController } from '../../browser/copyPasteController.js';

suite('CopyPasteController - paste edit session', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const endInteraction of ['dismiss', 'cursor', 'content', 'model', 'dispose', 'noSelector', 'singleEdit'] as const) {
		const name = endInteraction === 'noSelector'
			? 'releases edits after paste when the selector is disabled'
			: endInteraction === 'singleEdit'
				? 'releases edits after paste when there are no alternatives'
				: `resolves alternatives after the initial paste and releases edits on ${endInteraction}`;
		test(name, async () => {
			await withAsyncTestCodeEditor('', { pasteAs: { enabled: true, showPasteSelector: endInteraction === 'noSelector' ? 'never' : 'afterPaste' } }, async (editor, _viewModel, instantiationService) => {
				instantiationService.stub(createDecorator<{ add(): () => void }>('IEditorCancelService'), { add: () => () => { } });
				let selectEdit: ((index: number) => Promise<void>) | undefined;
				instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
					override show: IActionWidgetService['show'] = (_user, _preview, items, delegate) => {
						selectEdit = async index => { await delegate.onSelect(items[index].item!); };
					};
					override hide() { }
				});
				instantiationService.stub(IBulkEditService, new class extends mock<IBulkEditService>() {
					override async apply(edit: ResourceEdit[] | WorkspaceEdit) {
						const textEdits = (Array.isArray(edit) ? edit : edit.edits).map(edit => {
							assert.ok(ResourceTextEdit.is(edit));
							return { range: edit.textEdit.range, text: new SnippetParser().parse(edit.textEdit.text).toString() };
						});
						editor.getModel().pushStackElement();
						editor.getModel().pushEditOperations(editor.getSelections(), textEdits, () => null);
						editor.getModel().pushStackElement();
						return { isApplied: true, ariaSummary: '' };
					}
				});
				instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { });
				instantiationService.stub(IProgressService, new class extends mock<IProgressService>() { });

				let released = 0;
				let resolves = 0;
				const plainKind = new HierarchicalKind('text.plain');
				const provider: DocumentPasteEditProvider = {
					copyMimeTypes: [],
					pasteMimeTypes: ['text/plain'],
					providedPasteEditKinds: [plainKind],
					async provideDocumentPasteEdits() {
						return {
							edits: [
								{ title: 'Resolve test', insertText: 'UNRESOLVED', kind: new HierarchicalKind('test'), yieldTo: [{ kind: plainKind }] },
								{ title: 'Plain text', insertText: 'PLAIN', kind: plainKind }
							].slice(endInteraction === 'singleEdit' ? 1 : 0),
							dispose: () => { ++released; }
						};
					},
					async resolveDocumentPasteEdit(edit) {
						assert.strictEqual(released, 0, 'Provider edits must still be cached during resolve');
						++resolves;
						return { ...edit, insertText: edit.title === 'Resolve test' ? 'RESOLVED' : edit.insertText };
					}
				};
				const controller = disposables.add(instantiationService.createInstance(CopyPasteController, editor));
				const dataTransfer = new VSDataTransfer();
				dataTransfer.append('text/plain', createStringDataTransferItem('PLAIN'));
				// The test editor has no clipboard view, so start the inline paste directly.
				// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
				controller['doPasteInline']([provider], editor.getSelections(), dataTransfer, undefined, undefined);
				await controller.finishedPaste();
				if (endInteraction === 'noSelector' || endInteraction === 'singleEdit') {
					assert.deepStrictEqual({ text: editor.getValue(), released, resolves }, { text: 'PLAIN', released: 1, resolves: 1 });
					return;
				}
				assert.deepStrictEqual({ text: editor.getValue(), released, resolves }, { text: 'PLAIN', released: 0, resolves: 1 });

				controller.changePasteType();
				assert.ok(selectEdit);
				await selectEdit(1);
				assert.deepStrictEqual({ text: editor.getValue(), released, resolves }, { text: 'RESOLVED', released: 0, resolves: 2 });

				controller.changePasteType();
				await selectEdit(0);
				assert.deepStrictEqual({ text: editor.getValue(), released, resolves }, { text: 'PLAIN', released: 0, resolves: 3 });

				switch (endInteraction) {
					case 'dismiss': controller.clearWidgets(); break;
					case 'cursor': editor.setPosition({ lineNumber: 1, column: 2 }); break;
					case 'content': editor.getModel().setValue('changed'); break;
					case 'model': editor.setModel(null); break;
					case 'dispose': controller.dispose(); break;
				}
				controller.clearWidgets();
				assert.strictEqual(released, 1);
			});
		});
	}
});
