/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { waitForState } from 'vs/base/common/observable';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';
import { IInlineChatService, IInlineChatSessionProvider } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { CellDiagnostics } from 'vs/workbench/contrib/notebook/browser/contrib/cellDiagnostics/cellDiagnosticEditorContrib';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { setupInstantiationService, TestNotebookExecutionStateService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';


suite('notebookCellDiagnostics', () => {

	let instantiationService: TestInstantiationService;
	let disposables: DisposableStore;
	let testExecutionService: TestExecutionService;
	let markerService: IMarkerService;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestExecutionService extends TestNotebookExecutionStateService {
		private _onDidChangeExecution = new Emitter<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>();
		override onDidChangeExecution = this._onDidChangeExecution.event;

		fireExecutionChanged(notebook: URI, cellHandle: number) {
			this._onDidChangeExecution.fire({
				type: NotebookExecutionType.cell,
				cellHandle,
				notebook,
				affectsNotebook: () => true,
				affectsCell: () => true
			});
		}
	}

	setup(function () {

		disposables = new DisposableStore();

		instantiationService = setupInstantiationService(disposables);
		testExecutionService = new TestExecutionService();
		instantiationService.stub(INotebookExecutionStateService, testExecutionService);

		const chatProviders = instantiationService.get<IInlineChatService>(IInlineChatService);
		disposables.add(chatProviders.addProvider({} as IInlineChatSessionProvider));

		markerService = new class extends mock<IMarkerService>() {
			markers: IMarkerData[] = [];
			override changeOne(owner: string, resource: URI, markers: IMarkerData[]) {
				this.markers = markers;
			}
		};
		instantiationService.stub(IMarkerService, markerService);

		const config = instantiationService.get<IConfigurationService>(IConfigurationService) as TestConfigurationService;
		config.setUserConfiguration(NotebookSetting.cellFailureDiagnostics, true);
	});

	test('diagnostic is added for cell execution failure', async function () {
		await withTestNotebook([
			['print(x)', 'python', CellKind.Code, [], {}]
		], async (editor, viewModel, store, accessor) => {
			const cell = viewModel.viewCells[0] as CodeCellViewModel;

			disposables.add(instantiationService.createInstance(CellDiagnostics, editor));

			cell.model.internalMetadata.error = {
				message: 'error',
				stack: 'line 1 : print(x)',
				uri: cell.uri,
				location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
			};
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle);

			await waitForState(cell.excecutionError, error => !!error);
			assert.strictEqual(cell?.excecutionError.get()?.message, 'error');
		}, instantiationService);
	});
});
