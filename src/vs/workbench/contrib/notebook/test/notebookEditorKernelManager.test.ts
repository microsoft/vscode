/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from 'vs/base/common/uri';
import { assertThrowsAsync } from 'vs/base/test/common/utils';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { NotebookEditorKernelManager } from 'vs/workbench/contrib/notebook/browser/notebookEditorKernelManager';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, ICellRange, INotebookKernel, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { TestQuickInputService } from 'vs/workbench/test/browser/workbenchTestServices';
import { Event } from 'vs/base/common/event';

suite('NotebookEditorKernelManager', () => {
	const instantiationService = setupInstantiationService();
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IQuickInputService, new TestQuickInputService());

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
				const kernelManager = instantiationService.createInstance(NotebookEditorKernelManager, {
					activeKernel: new TestNotebookKernel({ languages: ['testlang'] }),
					viewModel
				});

				const cell = viewModel.createCell(1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await assertThrowsAsync(async () => await kernelManager.executeNotebookCell(cell));
			});
	});

	test('cell is runnable when kernel does support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernel = new TestNotebookKernel({ languages: ['javascript'] });
				const kernelManager: NotebookEditorKernelManager = instantiationService.createInstance(NotebookEditorKernelManager, {
					activeKernel: kernel,
					viewModel
				});
				const executeSpy = sinon.spy();
				kernel.executeNotebookCellsRequest = executeSpy;

				const cell = viewModel.createCell(0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true);
				await kernelManager.executeNotebookCell(cell);
				assert.strictEqual(executeSpy.calledOnce, true);
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
	supportedLanguages?: string[] | undefined;
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
