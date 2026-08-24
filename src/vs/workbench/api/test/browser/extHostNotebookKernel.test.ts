/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Barrier } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ICellExecuteUpdateDto, ICellExecutionCompleteDto, INotebookKernelDto2, MainContext, MainThreadCommandsShape, MainThreadNotebookDocumentsShape, MainThreadNotebookKernelsShape, MainThreadNotebookShape } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { ExtHostNotebookController } from '../../common/extHostNotebook.js';
import { ExtHostNotebookDocument } from '../../common/extHostNotebookDocument.js';
import { ExtHostNotebookDocuments } from '../../common/extHostNotebookDocuments.js';
import { ExtHostNotebookKernels } from '../../common/extHostNotebookKernels.js';
import { NotebookCellOutput, NotebookCellOutputItem } from '../../common/extHostTypes.js';
import { CellKind, CellUri, NotebookCellsChangeType } from '../../../contrib/notebook/common/notebookCommon.js';
import { CellExecutionUpdateType } from '../../../contrib/notebook/common/notebookExecutionService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ExtHostConsumerFileSystem } from '../../common/extHostFileSystemConsumer.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostSearch } from '../../common/extHostSearch.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';

suite('NotebookKernel', function () {
	let rpcProtocol: TestRPCProtocol;
	let extHostNotebookKernels: ExtHostNotebookKernels;
	let notebook: ExtHostNotebookDocument;
	let extHostDocumentsAndEditors: ExtHostDocumentsAndEditors;
	let extHostDocuments: ExtHostDocuments;
	let extHostNotebooks: ExtHostNotebookController;
	let extHostNotebookDocuments: ExtHostNotebookDocuments;
	let extHostCommands: ExtHostCommands;
	let extHostConsumerFileSystem: ExtHostConsumerFileSystem;
	let extHostSearch: ExtHostSearch;

	const notebookUri = URI.parse('test:///notebook.file');
	const kernelData = new Map<number, INotebookKernelDto2>();
	const disposables = new DisposableStore();

	const cellExecuteCreate: { notebook: UriComponents; cell: number }[] = [];
	const cellExecuteUpdates: ICellExecuteUpdateDto[] = [];
	const cellExecuteComplete: ICellExecutionCompleteDto[] = [];

	teardown(function () {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(async function () {
		cellExecuteCreate.length = 0;
		cellExecuteUpdates.length = 0;
		cellExecuteComplete.length = 0;
		kernelData.clear();

		rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand() { }
		});
		rpcProtocol.set(MainContext.MainThreadNotebookKernels, new class extends mock<MainThreadNotebookKernelsShape>() {
			override async $addKernel(handle: number, data: INotebookKernelDto2): Promise<void> {
				kernelData.set(handle, data);
			}
			override $removeKernel(handle: number) {
				kernelData.delete(handle);
			}
			override $updateKernel(handle: number, data: Partial<INotebookKernelDto2>) {
				assert.strictEqual(kernelData.has(handle), true);
				kernelData.set(handle, { ...kernelData.get(handle)!, ...data, });
			}
			override $createExecution(handle: number, controllerId: string, uri: UriComponents, cellHandle: number): void {
				cellExecuteCreate.push({ notebook: uri, cell: cellHandle });
			}
			override $updateExecution(handle: number, data: SerializableObjectWithBuffers<ICellExecuteUpdateDto[]>): void {
				cellExecuteUpdates.push(...data.value);
			}
			override $completeExecution(handle: number, data: SerializableObjectWithBuffers<ICellExecutionCompleteDto>): void {
				cellExecuteComplete.push(data.value);
			}
		});
		rpcProtocol.set(MainContext.MainThreadNotebookDocuments, new class extends mock<MainThreadNotebookDocumentsShape>() {

		});
		rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock<MainThreadNotebookShape>() {
			override async $registerNotebookSerializer() { }
			override async $unregisterNotebookSerializer() { }
		});
		extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
		extHostDocuments = disposables.add(new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors));
		extHostCommands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean {
				return true;
			}
		});
		extHostConsumerFileSystem = new ExtHostConsumerFileSystem(rpcProtocol, new ExtHostFileSystemInfo());
		extHostSearch = new ExtHostSearch(rpcProtocol, new URITransformerService(null), new NullLogService());
		extHostNotebooks = new ExtHostNotebookController(rpcProtocol, extHostCommands, extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, new NullLogService());

		extHostNotebookDocuments = new ExtHostNotebookDocuments(extHostNotebooks);

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
			addedDocuments: [{
				uri: notebookUri,
				viewType: 'test',
				versionId: 0,
				cells: [{
					handle: 0,
					uri: CellUri.generate(notebookUri, 0),
					source: ['### Heading'],
					eol: '\n',
					language: 'markdown',
					cellKind: CellKind.Markup,
					outputs: [],
				}, {
					handle: 1,
					uri: CellUri.generate(notebookUri, 1),
					source: ['console.log("aaa")', 'console.log("bbb")'],
					eol: '\n',
					language: 'javascript',
					cellKind: CellKind.Code,
					outputs: [],
				}],
			}],
			addedEditors: [{
				documentUri: notebookUri,
				id: '_notebook_editor_0',
				selections: [{ start: 0, end: 1 }],
				visibleRanges: [],
				viewType: 'test',
			}]
		}));
		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: '_notebook_editor_0' }));

		notebook = extHostNotebooks.notebookDocuments[0]!;

		disposables.add(notebook);
		disposables.add(extHostDocuments);


		extHostNotebookKernels = new ExtHostNotebookKernels(
			rpcProtocol,
			new class extends mock<IExtHostInitDataService>() { },
			extHostNotebooks,
			extHostCommands,
			new NullLogService()
		);
	});

	test('create/dispose kernel', async function () {

		const kernel = extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo');

		// eslint-disable-next-line local/code-no-any-casts
		assert.throws(() => (<any>kernel).id = 'dd');
		// eslint-disable-next-line local/code-no-any-casts
		assert.throws(() => (<any>kernel).notebookType = 'dd');

		assert.ok(kernel);
		assert.strictEqual(kernel.id, 'foo');
		assert.strictEqual(kernel.label, 'Foo');
		assert.strictEqual(kernel.notebookType, '*');

		await rpcProtocol.sync();
		assert.strictEqual(kernelData.size, 1);

		const [first] = kernelData.values();
		assert.strictEqual(first.id, 'nullExtensionDescription/foo');
		assert.strictEqual(ExtensionIdentifier.equals(first.extensionId, nullExtensionDescription.identifier), true);
		assert.strictEqual(first.label, 'Foo');
		assert.strictEqual(first.notebookType, '*');

		kernel.dispose();
		await rpcProtocol.sync();
		assert.strictEqual(kernelData.size, 0);
	});

	test('update kernel', async function () {

		const kernel = disposables.add(extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo'));

		await rpcProtocol.sync();
		assert.ok(kernel);

		let [first] = kernelData.values();
		assert.strictEqual(first.id, 'nullExtensionDescription/foo');
		assert.strictEqual(first.label, 'Foo');

		kernel.label = 'Far';
		assert.strictEqual(kernel.label, 'Far');

		await rpcProtocol.sync();
		[first] = kernelData.values();
		assert.strictEqual(first.id, 'nullExtensionDescription/foo');
		assert.strictEqual(first.label, 'Far');
	});

	test('execute - simple createNotebookCellExecution', function () {
		const kernel = disposables.add(extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo'));

		extHostNotebookKernels.$acceptNotebookAssociation(0, notebook.uri, true);

		const cell1 = notebook.apiNotebook.cellAt(0);
		const task = kernel.createNotebookCellExecution(cell1);
		task.start();
		task.end(undefined);
	});

	test('createNotebookCellExecution, must be selected/associated', function () {
		const kernel = disposables.add(extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo'));
		assert.throws(() => {
			kernel.createNotebookCellExecution(notebook.apiNotebook.cellAt(0));
		});

		extHostNotebookKernels.$acceptNotebookAssociation(0, notebook.uri, true);
		const execution = kernel.createNotebookCellExecution(notebook.apiNotebook.cellAt(0));
		execution.end(true);
	});

	test('createNotebookCellExecution, cell must be alive', function () {
		const kernel = disposables.add(extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo'));

		const cell1 = notebook.apiNotebook.cellAt(0);

		extHostNotebookKernels.$acceptNotebookAssociation(0, notebook.uri, true);
		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 12,
			rawEvents: [{
				kind: NotebookCellsChangeType.ModelChange,
				changes: [[0, notebook.apiNotebook.cellCount, []]]
			}]
		}), true);

		assert.strictEqual(cell1.index, -1);

		assert.throws(() => {
			kernel.createNotebookCellExecution(cell1);
		});
	});

	test('interrupt handler, cancellation', async function () {

		let interruptCallCount = 0;
		let tokenCancelCount = 0;

		const kernel = disposables.add(extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo'));
		kernel.interruptHandler = () => { interruptCallCount += 1; };
		extHostNotebookKernels.$acceptNotebookAssociation(0, notebook.uri, true);

		const cell1 = notebook.apiNotebook.cellAt(0);

		const task = kernel.createNotebookCellExecution(cell1);
		disposables.add(task.token.onCancellationRequested(() => tokenCancelCount += 1));

		await extHostNotebookKernels.$cancelCells(0, notebook.uri, [0]);
		assert.strictEqual(interruptCallCount, 1);
		assert.strictEqual(tokenCancelCount, 0);

		await extHostNotebookKernels.$cancelCells(0, notebook.uri, [0]);
		assert.strictEqual(interruptCallCount, 2);
		assert.strictEqual(tokenCancelCount, 0);

		// should cancelling the cells end the execution task?
		task.end(false);
	});

	test('set outputs on cancel', async function () {

		const kernel = disposables.add(extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo'));
		extHostNotebookKernels.$acceptNotebookAssociation(0, notebook.uri, true);

		const cell1 = notebook.apiNotebook.cellAt(0);
		const task = kernel.createNotebookCellExecution(cell1);
		task.start();

		const b = new Barrier();

		disposables.add(
			task.token.onCancellationRequested(async () => {
				await task.replaceOutput(new NotebookCellOutput([NotebookCellOutputItem.text('canceled')]));
				task.end(true);
				b.open(); // use barrier to signal that cancellation has happened
			})
		);

		cellExecuteUpdates.length = 0;
		await extHostNotebookKernels.$cancelCells(0, notebook.uri, [0]);

		await b.wait();

		assert.strictEqual(cellExecuteUpdates.length > 0, true);

		let found = false;
		for (const edit of cellExecuteUpdates) {
			if (edit.editType === CellExecutionUpdateType.Output) {
				assert.strictEqual(edit.append, false);
				assert.strictEqual(edit.outputs.length, 1);
				assert.strictEqual(edit.outputs[0].items.length, 1);
				assert.deepStrictEqual(Array.from(edit.outputs[0].items[0].valueBytes.buffer), Array.from(new TextEncoder().encode('canceled')));
				found = true;
			}
		}
		assert.ok(found);
	});

	test('set outputs on interrupt', async function () {

		const kernel = extHostNotebookKernels.createNotebookController(nullExtensionDescription, 'foo', '*', 'Foo');
		extHostNotebookKernels.$acceptNotebookAssociation(0, notebook.uri, true);


		const cell1 = notebook.apiNotebook.cellAt(0);
		const task = kernel.createNotebookCellExecution(cell1);
		task.start();

		kernel.interruptHandler = async _notebook => {
			assert.ok(notebook.apiNotebook === _notebook);
			await task.replaceOutput(new NotebookCellOutput([NotebookCellOutputItem.text('interrupted')]));
			task.end(true);
		};

		cellExecuteUpdates.length = 0;
		await extHostNotebookKernels.$cancelCells(0, notebook.uri, [0]);

		assert.strictEqual(cellExecuteUpdates.length > 0, true);

		let found = false;
		for (const edit of cellExecuteUpdates) {
			if (edit.editType === CellExecutionUpdateType.Output) {
				assert.strictEqual(edit.append, false);
				assert.strictEqual(edit.outputs.length, 1);
				assert.strictEqual(edit.outputs[0].items.length, 1);
				assert.deepStrictEqual(Array.from(edit.outputs[0].items[0].valueBytes.buffer), Array.from(new TextEncoder().encode('interrupted')));
				found = true;
			}
		}
		assert.ok(found);
	});
});
