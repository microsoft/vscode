/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as DOM from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mock } from 'vs/base/test/common/mock';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { CodeCellRenderTemplate, ICellOutputViewModel, IOutputTransformContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { OutputRendererRegistry } from 'vs/workbench/contrib/notebook/browser/view/output/rendererRegistry';
import { getStringValue } from 'vs/workbench/contrib/notebook/browser/view/output/transforms/richTransform';
import { CellOutputContainer } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellOutput';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { BUILTIN_RENDERER_ID, CellEditType, CellKind, IOutputDto, IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService, valueBytesFromString, withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';

OutputRendererRegistry.registerOutputTransform(class implements IOutputTransformContribution {
	getType() { return RenderOutputType.Mainframe; }

	getMimetypes() {
		return ['application/vnd.code.notebook.stdout', 'application/x.notebook.stdout', 'application/x.notebook.stream'];
	}

	constructor() { }

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement): IRenderOutput {
		const text = getStringValue(item);
		const contentNode = DOM.$('span.output-stream');
		contentNode.textContent = text;
		container.appendChild(contentNode);
		return { type: RenderOutputType.Mainframe };
	}

	dispose() { }
});

suite('NotebookViewModel Outputs', async () => {
	const instantiationService = setupInstantiationService();
	instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
		override getOutputMimeTypeInfo(textModel: NotebookTextModel, kernelProvides: [], output: IOutputDto) {
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
					{ outputId: 'output_id_1', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('1') }] },
					{ outputId: 'output_id_2', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('2') }] },
					{ outputId: 'output_id_err', outputs: [{ mime: 'application/vnd.code.notebook.stderr', data: valueBytesFromString('1000') }] },
					{ outputId: 'output_id_3', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('3') }] },
				], {}]
			],
			(editor, viewModel, accessor) => {
				const container = new CellOutputContainer(editor, viewModel.viewCells[0] as CodeCellViewModel, {
					outputContainer: document.createElement('div'),
					outputShowMoreContainer: document.createElement('div'),
					editor: {
						getContentHeight: () => {
							return 100;
						}
					},
					disposables: new DisposableStore(),
				} as unknown as CodeCellRenderTemplate, { limit: 5 }, openerService, instantiationService);
				container.render(100);
				assert.strictEqual(container.renderedOutputEntries.length, 4);
				assert.strictEqual(container.renderedOutputEntries[0].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[1].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[2].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[3].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer, container.renderedOutputEntries[1].element.innerContainer);
				assert.notStrictEqual(container.renderedOutputEntries[1].element.innerContainer, container.renderedOutputEntries[2].element.innerContainer);
				assert.notStrictEqual(container.renderedOutputEntries[2].element.innerContainer, container.renderedOutputEntries[3].element.innerContainer);

				editor.textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					outputs: [
						{
							outputId: 'output_id_4',
							outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('4') }]
						},
						{
							outputId: 'output_id_5',
							outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('5') }]
						}
					],
					append: true
				}], true, undefined, () => undefined, undefined);
				assert.strictEqual(container.renderedOutputEntries.length, 5);
				// last one is merged with previous one
				assert.strictEqual(container.renderedOutputEntries[3].element.innerContainer, container.renderedOutputEntries[4].element.innerContainer);

				editor.textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					outputs: [
						{ outputId: 'output_id_1', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('1') }] },
						{ outputId: 'output_id_2', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('2') }] },
						{ outputId: 'output_id_err', outputs: [{ mime: 'application/vnd.code.notebook.stderr', data: valueBytesFromString('1000') }] },
						{
							outputId: 'output_id_5',
							outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('5') }]
						}
					],
				}], true, undefined, () => undefined, undefined);
				assert.strictEqual(container.renderedOutputEntries.length, 4);
				assert.strictEqual(container.renderedOutputEntries[0].model.model.outputId, 'output_id_1');
				assert.strictEqual(container.renderedOutputEntries[0].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[1].model.model.outputId, 'output_id_2');
				assert.strictEqual(container.renderedOutputEntries[1].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[2].model.model.outputId, 'output_id_err');
				assert.strictEqual(container.renderedOutputEntries[2].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[3].model.model.outputId, 'output_id_5');
				assert.strictEqual(container.renderedOutputEntries[3].element.useDedicatedDOM, true);
			},
			instantiationService
		);
	});

	test('stream outputs reuse output container 2', async () => {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [
					{ outputId: 'output_id_1', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('1') }] },
					{ outputId: 'output_id_2', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('2') }] },
					{ outputId: 'output_id_err', outputs: [{ mime: 'application/vnd.code.notebook.stderr', data: valueBytesFromString('1000') }] },
					{ outputId: 'output_id_4', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('4') }] },
					{ outputId: 'output_id_5', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('5') }] },
					{ outputId: 'output_id_6', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('6') }] },
				], {}]
			],
			(editor, viewModel, accessor) => {
				const container = new CellOutputContainer(editor, viewModel.viewCells[0] as CodeCellViewModel, {
					outputContainer: document.createElement('div'),
					outputShowMoreContainer: document.createElement('div'),
					editor: {
						getContentHeight: () => {
							return 100;
						}
					},
					disposables: new DisposableStore(),
				} as unknown as CodeCellRenderTemplate, { limit: 5 }, openerService, instantiationService);
				container.render(100);
				assert.strictEqual(container.renderedOutputEntries.length, 5);
				assert.strictEqual(container.renderedOutputEntries[0].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[1].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer.innerText, '12');

				assert.strictEqual(container.renderedOutputEntries[2].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[2].element.innerContainer.innerText, '1000');

				assert.strictEqual(container.renderedOutputEntries[3].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[4].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[3].element.innerContainer.innerText, '45');


				editor.textModel.applyEdits([{
					index: 0,
					editType: CellEditType.Output,
					outputs: [
						{ outputId: 'output_id_1', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('1') }] },
						{ outputId: 'output_id_2', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('2') }] },
						{ outputId: 'output_id_7', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('7') }] },
						{ outputId: 'output_id_5', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('5') }] },
						{ outputId: 'output_id_6', outputs: [{ mime: 'application/vnd.code.notebook.stdout', data: valueBytesFromString('6') }] },

					]
				}], true, undefined, () => undefined, undefined);
				assert.strictEqual(container.renderedOutputEntries.length, 5);
				assert.strictEqual(container.renderedOutputEntries[0].model.model.outputId, 'output_id_1');
				assert.strictEqual(container.renderedOutputEntries[1].model.model.outputId, 'output_id_2');
				assert.strictEqual(container.renderedOutputEntries[2].model.model.outputId, 'output_id_7');
				assert.strictEqual(container.renderedOutputEntries[3].model.model.outputId, 'output_id_5');
				assert.strictEqual(container.renderedOutputEntries[4].model.model.outputId, 'output_id_6');

				assert.strictEqual(container.renderedOutputEntries[0].element.useDedicatedDOM, true);
				assert.strictEqual(container.renderedOutputEntries[1].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[2].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[3].element.useDedicatedDOM, false);
				assert.strictEqual(container.renderedOutputEntries[4].element.useDedicatedDOM, false);

				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer, container.renderedOutputEntries[1].element.innerContainer);
				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer, container.renderedOutputEntries[2].element.innerContainer);
				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer, container.renderedOutputEntries[3].element.innerContainer);
				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer, container.renderedOutputEntries[4].element.innerContainer);

				assert.strictEqual(container.renderedOutputEntries[0].element.innerContainer.innerText, '12756');
			},
			instantiationService
		);
	});

});
