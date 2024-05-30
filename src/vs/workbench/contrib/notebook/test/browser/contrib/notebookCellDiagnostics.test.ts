/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { waitForState } from 'vs/base/common/observable';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IMarkerData, IMarkerService } from 'vs/platform/markers/common/markers';
import { ChatAgentLocation, IChatAgent, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CellDiagnostics } from 'vs/workbench/contrib/notebook/browser/contrib/cellDiagnostics/cellDiagnosticEditorContrib';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookCellExecution, INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { setupInstantiationService, TestNotebookExecutionStateService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';


suite('notebookCellDiagnostics', () => {

	let instantiationService: TestInstantiationService;
	let disposables: DisposableStore;
	let testExecutionService: TestExecutionService;
	let markerService: ITestMarkerService;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestExecutionService extends TestNotebookExecutionStateService {
		private _onDidChangeExecution = new Emitter<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>();
		override onDidChangeExecution = this._onDidChangeExecution.event;

		fireExecutionChanged(notebook: URI, cellHandle: number, changed?: INotebookCellExecution) {
			this._onDidChangeExecution.fire({
				type: NotebookExecutionType.cell,
				cellHandle,
				notebook,
				affectsNotebook: () => true,
				affectsCell: () => true,
				changed: changed
			});
		}
	}

	interface ITestMarkerService extends IMarkerService {
		markers: ResourceMap<IMarkerData[]>;
	}

	setup(function () {

		disposables = new DisposableStore();

		instantiationService = setupInstantiationService(disposables);
		testExecutionService = new TestExecutionService();
		instantiationService.stub(INotebookExecutionStateService, testExecutionService);

		const agentData = {
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: '',
			extensionPublisherId: '',
			name: 'testEditorAgent',
			isDefault: true,
			locations: [ChatAgentLocation.Editor],
			metadata: {},
			slashCommands: []
		};
		const chatAgentService = new class extends mock<IChatAgentService>() {
			override getAgents(): IChatAgentData[] {
				return [{
					id: 'testEditorAgent',
					...agentData
				}];
			}
			override onDidChangeAgents: Event<IChatAgent | undefined> = Event.None;
		};
		instantiationService.stub(IChatAgentService, chatAgentService);

		markerService = new class extends mock<ITestMarkerService>() {
			override markers: ResourceMap<IMarkerData[]> = new ResourceMap();
			override changeOne(owner: string, resource: URI, markers: IMarkerData[]) {
				this.markers.set(resource, markers);
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
			assert.equal(markerService.markers.get(cell.uri)?.length, 1);
		}, instantiationService);
	});

	test('diagnostics are cleared only for cell with new execution', async function () {
		await withTestNotebook([
			['print(x)', 'python', CellKind.Code, [], {}],
			['print(y)', 'python', CellKind.Code, [], {}]
		], async (editor, viewModel, store, accessor) => {
			const cell = viewModel.viewCells[0] as CodeCellViewModel;
			const cell2 = viewModel.viewCells[1] as CodeCellViewModel;

			disposables.add(instantiationService.createInstance(CellDiagnostics, editor));

			cell.model.internalMetadata.error = {
				message: 'error',
				stack: 'line 1 : print(x)',
				uri: cell.uri,
				location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
			};
			cell2.model.internalMetadata.error = {
				message: 'another error',
				stack: 'line 1 : print(y)',
				uri: cell.uri,
				location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
			};
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle);
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell2.handle);

			await waitForState(cell.excecutionError, error => !!error);
			await waitForState(cell2.excecutionError, error => !!error);
			cell.model.internalMetadata.error = undefined;

			// on NotebookCellExecution value will make it look like its currently running
			testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle, {} as INotebookCellExecution);

			await waitForState(cell.excecutionError, error => error === undefined);

			assert.strictEqual(cell?.excecutionError.get(), undefined);
			assert.strictEqual(cell2?.excecutionError.get()?.message, 'another error', 'cell that was not executed should still have an error');
			assert.equal(markerService.markers.get(cell.uri)?.length, 0);
			assert.equal(markerService.markers.get(cell2.uri)?.length, 1);
		}, instantiationService);
	});
});
