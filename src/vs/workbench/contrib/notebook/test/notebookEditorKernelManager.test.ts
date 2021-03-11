/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { assertThrowsAsync } from 'vs/base/test/common/utils';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { NOTEBOOK_KERNEL_COUNT } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorKernelManager } from 'vs/workbench/contrib/notebook/browser/notebookEditorKernelManager';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, ICellRange, INotebookKernel, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { TestQuickInputService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('NotebookEditorKernelManager', () => {
	const instantiationService = setupInstantiationService();
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IQuickInputService, new TestQuickInputService());

	const loadKernelPreloads = async () => { };

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor) => callback(editor.viewModel, editor.viewModel.notebookDocument));
	}

	test('ctor', () => {
		instantiationService.createInstance(NotebookEditorKernelManager, {});
		const contextKeyService = instantiationService.get(IContextKeyService);

		assert.strictEqual(contextKeyService.getContextKeyValue(NOTEBOOK_KERNEL_COUNT.key), 0);
	});

	test('cell is not runnable when no kernel is selected', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernelManager: NotebookEditorKernelManager = instantiationService.createInstance(NotebookEditorKernelManager, { viewModel, loadKernelPreloads });

				const cell = viewModel.createCell(1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await assertThrowsAsync(async () => await kernelManager.executeNotebookCell(cell));
			});
	});

	test('cell is not runnable when kernel does not support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernelManager: NotebookEditorKernelManager = instantiationService.createInstance(NotebookEditorKernelManager, { viewModel, loadKernelPreloads });
				kernelManager.activeKernel = new TestNotebookKernel({ languages: ['testlang'] });

				const cell = viewModel.createCell(1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await assertThrowsAsync(async () => await kernelManager.executeNotebookCell(cell));
			});
	});

	test('cell is runnable when kernel does support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernelManager: NotebookEditorKernelManager = instantiationService.createInstance(NotebookEditorKernelManager, { viewModel, loadKernelPreloads });
				const kernel = new TestNotebookKernel({ languages: ['javascript'] });
				const executeSpy = sinon.spy();
				kernel.executeNotebookCellsRequest = executeSpy;
				kernelManager.activeKernel = kernel;

				const cell = viewModel.createCell(0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await kernelManager.executeNotebookCell(cell);
				assert.strictEqual(executeSpy.calledOnce, true);
			});
	});
});

class TestNotebookKernel implements INotebookKernel {
	id?: string | undefined;
	friendlyId: string = '';
	label: string = '';
	extension: ExtensionIdentifier = new ExtensionIdentifier('test');
	extensionLocation: URI = URI.file('/test');
	providerHandle?: number | undefined;
	description?: string | undefined;
	detail?: string | undefined;
	isPreferred?: boolean | undefined;
	preloads?: URI[] | undefined;
	supportedLanguages?: string[] | undefined;
	async resolve(uri: URI, editorId: string, token: CancellationToken): Promise<void> { }
	executeNotebookCellsRequest(uri: URI, ranges: ICellRange[]): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelNotebookCellExecution(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	constructor(opts?: { languages?: string[] }) {
		this.supportedLanguages = opts?.languages;
	}
}
