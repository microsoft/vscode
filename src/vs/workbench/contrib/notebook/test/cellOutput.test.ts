/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from 'vs/base/test/common/mock';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { CodeCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellOutputContainer } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellOutput';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { BUILTIN_RENDERER_ID, CellEditType, CellKind, IOutputDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';

suite('NotebookViewModel Outputs', async () => {
	const instantiationService = setupInstantiationService();
	instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
		override getMimeTypeInfo(textModel: NotebookTextModel, kernelProvides: [], output: IOutputDto) {
			if (output.outputId === 'output_id_err') {
				return [{
					mimeType: 'application/vnd.code.notebook.stderr',
					rendererId: BUILTIN_RENDERER_ID,
					isTrusted: true
				}];
			}
			return [{
				mimeType: 'application/vnd.code.notebook.stdout',
				rendererId: BUILTIN_RENDERER_ID,
				isTrusted: true
			}];
		}
	});

	instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
		override createMenu(arg: any, context: any): any {
			return {
				onDidChange: () => { },
				getActions: (arg: any) => {
					return [];
				}
			};
		}
	});

	instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() {
		override lookupKeybinding(arg: any): any {
			return null;
		}
	});

	const openerService = instantiationService.stub(IOpenerService, {});

	test('stream outputs reuse output container', async () => {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [
					{ outputId: 'output_id_1', outputs: [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: [1] }] },
					{ outputId: 'output_id_2', outputs: [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: [2] }] },
					{ outputId: 'output_id_err', outputs: [{ mime: 'application/vnd.code.notebook.stderr', valueBytes: [4] }] },
					{ outputId: 'output_id_3', outputs: [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: [3] }] },
				], {}]
			],
			(editor, accessor) => {
				const viewModel = editor.viewModel;
				const container = new CellOutputContainer(editor, viewModel.viewCells[0] as CodeCellViewModel, {
					outputContainer: document.createElement('div'),
					outputShowMoreContainer: document.createElement('div'),
					editor: {
						getContentHeight: () => {
							return 100;
						}
					}
				} as unknown as CodeCellRenderTemplate, openerService, instantiationService);
				container.render(100);
				assert.strictEqual(container.renderedOutputEntries.length, 4);
				assert.strictEqual(container.renderedOutputEntries[0].entry.innerContainer, container.renderedOutputEntries[1].entry.innerContainer);
				assert.notStrictEqual(container.renderedOutputEntries[1].entry.innerContainer, container.renderedOutputEntries[2].entry.innerContainer);
				assert.notStrictEqual(container.renderedOutputEntries[2].entry.innerContainer, container.renderedOutputEntries[3].entry.innerContainer);

				viewModel.notebookDocument.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					outputs: [
						{
							outputId: 'output_id_5',
							outputs: [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: [5] }]
						}
					],
					append: true
				}], true, undefined, () => undefined, undefined);
				assert.strictEqual(container.renderedOutputEntries.length, 5);
				// last one is merged with previous one
				assert.strictEqual(container.renderedOutputEntries[3].entry.innerContainer, container.renderedOutputEntries[4].entry.innerContainer);
			},
			instantiationService
		);
	});

});
