/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from 'vs/base/common/uri';
import { assertThrowsAsync } from 'vs/base/test/common/utils';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { NotebookEditorKernelManager } from 'vs/workbench/contrib/notebook/browser/notebookEditorKernelManager';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, INotebookKernel, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { Event } from 'vs/base/common/event';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/notebookKernelServiceImpl';
import { NullLogService } from 'vs/platform/log/common/log';

suite('NotebookEditorKernelManager', () => {
	const instantiationService = setupInstantiationService();
	const kernelService = new NotebookKernelService(new TestStorageService(), new NullLogService());
	instantiationService.set(INotebookKernelService, kernelService);

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor) => callback(editor.viewModel, editor.viewModel.notebookDocument));
	}

	// test('ctor', () => {
	// 	instantiationService.createInstance(NotebookEditorKernelManager, { activeKernel: undefined, viewModel: undefined });
	// 	const contextKeyService = instantiationService.get(IContextKeyService);

	// 	assert.strictEqual(contextKeyService.getContextKeyValue(NOTEBOOK_KERNEL_COUNT.key), 0);
	// });

	test('cell is not runnable when no kernel is selected', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernelManager = instantiationService.createInstance(NotebookEditorKernelManager, { activeKernel: undefined, viewModel });

				const cell = viewModel.createCell(1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await assertThrowsAsync(async () => await kernelManager.executeNotebookCell(cell));
			});
	});

	test('cell is not runnable when kernel does not support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {

				const d = kernelService.registerKernel(new TestNotebookKernel({ languages: ['testlang'] }));
				const kernelManager = instantiationService.createInstance(NotebookEditorKernelManager);
				const cell = viewModel.createCell(1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await assertThrowsAsync(async () => await kernelManager.executeNotebookCell(cell));
				d.dispose();
			});
	});

	test('cell is runnable when kernel does support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernel = new TestNotebookKernel({ languages: ['javascript'] });
				const d = kernelService.registerKernel(kernel);
				const kernelManager = instantiationService.createInstance(NotebookEditorKernelManager);
				const executeSpy = sinon.spy();
				kernel.executeNotebookCellsRequest = executeSpy;

				const cell = viewModel.createCell(0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await kernelManager.executeNotebookCells(viewModel.notebookDocument, [cell]);
				assert.strictEqual(executeSpy.calledOnce, true);
				d.dispose();
			});
	});
});

class TestNotebookKernel implements INotebookKernel {
	id: string = 'test';
	label: string = '';
	selector = '*';
	onDidChange = Event.None;
	extension: ExtensionIdentifier = new ExtensionIdentifier('test');
	localResourceRoot: URI = URI.file('/test');
	description?: string | undefined;
	detail?: string | undefined;
	isPreferred?: boolean | undefined;
	preloadUris: URI[] = [];
	preloadProvides: string[] = [];
	supportedLanguages: string[] = [];
	executeNotebookCellsRequest(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelNotebookCellExecution(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	constructor(opts?: { languages: string[] }) {
		this.supportedLanguages = opts?.languages ?? ['text/plain'];
	}
}
