/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestRPCProtocol } from 'vs/workbench/test/browser/api/testRPCProtocol';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { NullLogService } from 'vs/platform/log/common/log';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostNotebookDocument } from 'vs/workbench/api/common/extHostNotebookDocument';
import { URI } from 'vs/base/common/uri';
import { CellKind, CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import * as vscode from 'vscode';
import { mock } from 'vs/workbench/test/common/workbenchTestServices';
import { MainContext, MainThreadCommandsShape, MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { generateUuid } from 'vs/base/common/uuid';
import { CancellationToken } from 'vs/base/common/cancellation';

suite('NotebookKernel', function () {

	let rpcProtocol: TestRPCProtocol;
	let notebook: ExtHostNotebookDocument;
	let extHostDocumentsAndEditors: ExtHostDocumentsAndEditors;
	let extHostDocuments: ExtHostDocuments;
	let extHostNotebooks: ExtHostNotebookController;
	const notebookUri = URI.parse('test:///notebook.file');
	const disposables = new DisposableStore();

	setup(async function () {
		disposables.clear();

		rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand() { }
		});
		rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock<MainThreadNotebookShape>() {
			async override $registerNotebookProvider() { }
			async override $unregisterNotebookProvider() { }
			async override $registerNotebookKernelProvider() { }
			async override $unregisterNotebookKernelProvider() { }
		});
		extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
		extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
		const extHostStoragePaths = new class extends mock<IExtensionStoragePaths>() {
			override workspaceValue() {
				return URI.from({ scheme: 'test', path: generateUuid() });
			}
		};
		extHostNotebooks = new ExtHostNotebookController(rpcProtocol, new ExtHostCommands(rpcProtocol, new NullLogService()), extHostDocumentsAndEditors, extHostDocuments, { isExtensionDevelopmentDebug: false, webviewCspSource: '', webviewResourceRoot: '' }, new NullLogService(), extHostStoragePaths);
		let reg = extHostNotebooks.registerNotebookContentProvider(nullExtensionDescription, 'test', new class extends mock<vscode.NotebookContentProvider>() {
			// async openNotebook() { }
		});

		const kernels = [new class extends mock<vscode.NotebookKernel>() {
			override id = 'first';
		}, new class extends mock<vscode.NotebookKernel>() {
			override id = 'second';
		}];

		let kernelReg = extHostNotebooks.registerNotebookKernelProvider(nullExtensionDescription, { viewType: 'test' }, new class extends mock<vscode.NotebookKernelProvider>() {
			async override provideKernels() { return kernels; }
		});

		// init
		extHostNotebooks.$acceptDocumentAndEditorsDelta({
			addedDocuments: [{
				uri: notebookUri,
				viewType: 'test',
				cells: [{
					handle: 0,
					uri: CellUri.generate(notebookUri, 0),
					source: ['console.log'],
					eol: '\n',
					language: 'javascript',
					cellKind: CellKind.Code,
					outputs: [],
				}],
				versionId: 0
			}],
			addedEditors: [
				{
					documentUri: notebookUri,
					id: '_notebook_editor_0',
					selections: [{ start: 0, end: 1 }],
					visibleRanges: []
				}
			]
		});
		extHostNotebooks.$acceptDocumentAndEditorsDelta({ newActiveEditor: '_notebook_editor_0' });

		notebook = extHostNotebooks.notebookDocuments[0]!;

		disposables.add(reg);
		disposables.add(kernelReg);
		disposables.add(notebook);
		disposables.add(extHostDocuments);
	});

	test('provide kernels', async function () {
		const dto = await extHostNotebooks.$provideNotebookKernels(0, notebook.uri, CancellationToken.None);
		assert.deepStrictEqual(dto.map(kernel => kernel.id), ['first', 'second']);
	});
});
