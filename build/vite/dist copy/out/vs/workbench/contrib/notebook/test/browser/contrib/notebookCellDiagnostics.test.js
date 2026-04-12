/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { CellDiagnostics } from '../../../browser/contrib/cellDiagnostics/cellDiagnosticEditorContrib.js';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
import { setupInstantiationService, TestNotebookExecutionStateService, withTestNotebook } from '../testNotebookEditor.js';
import { nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../chat/common/constants.js';
suite('notebookCellDiagnostics', () => {
    let instantiationService;
    let disposables;
    let testExecutionService;
    let markerService;
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    class TestExecutionService extends TestNotebookExecutionStateService {
        constructor() {
            super(...arguments);
            this._onDidChangeExecution = new Emitter();
            this.onDidChangeExecution = this._onDidChangeExecution.event;
        }
        fireExecutionChanged(notebook, cellHandle, changed) {
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
    setup(function () {
        disposables = new DisposableStore();
        instantiationService = setupInstantiationService(disposables);
        testExecutionService = new TestExecutionService();
        instantiationService.stub(INotebookExecutionStateService, testExecutionService);
        const agentData = {
            extensionId: nullExtensionDescription.identifier,
            extensionVersion: undefined,
            extensionDisplayName: '',
            extensionPublisherId: '',
            name: 'testEditorAgent',
            isDefault: true,
            locations: [ChatAgentLocation.Notebook],
            modes: [ChatModeKind.Ask],
            metadata: {},
            slashCommands: [],
            disambiguation: [],
        };
        const chatAgentService = new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeAgents = Event.None;
            }
            getAgents() {
                return [{
                        id: 'testEditorAgent',
                        ...agentData
                    }];
            }
        };
        instantiationService.stub(IChatAgentService, chatAgentService);
        markerService = new class extends mock() {
            constructor() {
                super(...arguments);
                this._onMarkersUpdated = new Emitter();
                this.onMarkersUpdated = this._onMarkersUpdated.event;
                this.markers = new ResourceMap();
            }
            changeOne(owner, resource, markers) {
                this.markers.set(resource, markers);
                this._onMarkersUpdated.fire();
            }
        };
        instantiationService.stub(IMarkerService, markerService);
        const config = instantiationService.get(IConfigurationService);
        config.setUserConfiguration(NotebookSetting.cellFailureDiagnostics, true);
    });
    test('diagnostic is added for cell execution failure', async function () {
        await withTestNotebook([
            ['print(x)', 'python', CellKind.Code, [], {}]
        ], async (editor, viewModel, store, accessor) => {
            const cell = viewModel.viewCells[0];
            disposables.add(instantiationService.createInstance(CellDiagnostics, editor));
            cell.model.internalMetadata.lastRunSuccess = false;
            cell.model.internalMetadata.error = {
                name: 'error',
                message: 'something bad happened',
                stack: 'line 1 : print(x)',
                uri: cell.uri,
                location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
            };
            testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle);
            await new Promise(resolve => Event.once(markerService.onMarkersUpdated)(resolve));
            assert.strictEqual(cell?.executionErrorDiagnostic.get()?.message, 'something bad happened');
            assert.equal(markerService.markers.get(cell.uri)?.length, 1);
        }, instantiationService);
    });
    test('diagnostics are cleared only for cell with new execution', async function () {
        await withTestNotebook([
            ['print(x)', 'python', CellKind.Code, [], {}],
            ['print(y)', 'python', CellKind.Code, [], {}]
        ], async (editor, viewModel, store, accessor) => {
            const cell = viewModel.viewCells[0];
            const cell2 = viewModel.viewCells[1];
            disposables.add(instantiationService.createInstance(CellDiagnostics, editor));
            cell.model.internalMetadata.lastRunSuccess = false;
            cell.model.internalMetadata.error = {
                name: 'error',
                message: 'something bad happened',
                stack: 'line 1 : print(x)',
                uri: cell.uri,
                location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
            };
            cell2.model.internalMetadata.lastRunSuccess = false;
            cell2.model.internalMetadata.error = {
                name: 'error',
                message: 'another bad thing happened',
                stack: 'line 1 : print(y)',
                uri: cell.uri,
                location: { startColumn: 1, endColumn: 5, startLineNumber: 1, endLineNumber: 1 }
            };
            testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle);
            testExecutionService.fireExecutionChanged(editor.textModel.uri, cell2.handle);
            await new Promise(resolve => Event.once(markerService.onMarkersUpdated)(resolve));
            const clearMarkers = new Promise(resolve => Event.once(markerService.onMarkersUpdated)(resolve));
            // on NotebookCellExecution value will make it look like its currently running
            testExecutionService.fireExecutionChanged(editor.textModel.uri, cell.handle, {});
            await clearMarkers;
            assert.strictEqual(cell?.executionErrorDiagnostic.get(), undefined);
            assert.strictEqual(cell2?.executionErrorDiagnostic.get()?.message, 'another bad thing happened', 'cell that was not executed should still have an error');
            assert.equal(markerService.markers.get(cell.uri)?.length, 0);
            assert.equal(markerService.markers.get(cell2.uri)?.length, 1);
        }, instantiationService);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsRGlhZ25vc3RpY3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9jb250cmliL25vdGVib29rQ2VsbERpYWdub3N0aWNzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFHekcsT0FBTyxFQUFlLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ25HLE9BQU8sRUFBOEIsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFFMUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFPLEVBQXdGLDhCQUE4QixFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL00sT0FBTyxFQUFFLHlCQUF5QixFQUFFLGlDQUFpQyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDMUgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seURBQXlELENB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