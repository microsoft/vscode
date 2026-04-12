/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { ChatEditingCheckpointTimelineImpl } from '../../../browser/chatEditing/chatEditingCheckpointTimelineImpl.js';
import { FileOperationType } from '../../../browser/chatEditing/chatEditingOperations.js';
suite('ChatEditingCheckpointTimeline', function () {
    const store = new DisposableStore();
    let timeline;
    let fileContents;
    let fileDelegate;
    const DEFAULT_TELEMETRY_INFO = upcastPartial({
        agentId: 'testAgent',
        command: undefined,
        sessionResource: URI.parse('chat://test-session'),
        requestId: 'test-request',
        result: undefined,
        modelId: undefined,
        modeId: undefined,
        applyCodeBlockSuggestionId: undefined,
        feature: undefined,
    });
    function createTextEditOperation(uri, requestId, epoch, edits) {
        return upcastPartial({
            type: FileOperationType.TextEdit,
            uri,
            requestId,
            epoch,
            edits
        });
    }
    function createFileCreateOperation(uri, requestId, epoch, initialContent) {
        return upcastPartial({
            type: FileOperationType.Create,
            uri,
            requestId,
            epoch,
            initialContent
        });
    }
    function createFileDeleteOperation(uri, requestId, epoch, finalContent) {
        return upcastPartial({
            type: FileOperationType.Delete,
            uri,
            requestId,
            epoch,
            finalContent
        });
    }
    function createFileRenameOperation(oldUri, newUri, requestId, epoch) {
        return upcastPartial({
            type: FileOperationType.Rename,
            uri: newUri,
            requestId,
            epoch,
            oldUri,
            newUri
        });
    }
    setup(function () {
        fileContents = new ResourceMap();
        fileDelegate = {
            createFile: async (uri, initialContent) => {
                fileContents.set(uri, initialContent);
            },
            deleteFile: async (uri) => {
                fileContents.delete(uri);
            },
            renameFile: async (fromUri, toUri) => {
                const content = fileContents.get(fromUri);
                if (content !== undefined) {
                    fileContents.set(toUri, content);
                    fileContents.delete(fromUri);
                }
            },
            setContents: async (uri, content) => {
                fileContents.set(uri, content);
            }
        };
        const collection = new ServiceCollection();
        collection.set(INotebookService, new SyncDescriptor(TestNotebookService));
        const insta = store.add(workbenchInstantiationService(undefined, store).createChild(collection));
        timeline = insta.createInstance(ChatEditingCheckpointTimelineImpl, URI.parse('chat://test-session'), fileDelegate);
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('creates initial checkpoint on construction', function () {
        const checkpoints = timeline.getStateForPersistence().checkpoints;
        assert.strictEqual(checkpoints.length, 1);
        assert.strictEqual(checkpoints[0].requestId, undefined);
        assert.strictEqual(checkpoints[0].label, 'Initial State');
    });
    test('canUndo and canRedo are initially false', function () {
        assert.strictEqual(timeline.canUndo.get(), false);
        assert.strictEqual(timeline.canRedo.get(), false);
    });
    test('createCheckpoint increments epoch and creates checkpoint', function () {
        const initialEpoch = timeline.getStateForPersistence().epochCounter;
        timeline.createCheckpoint('req1', 'stop1', 'Checkpoint 1');
        const state = timeline.getStateForPersistence();
        assert.strictEqual(state.checkpoints.length, 2); // Initial + new checkpoint
        assert.strictEqual(state.checkpoints[1].requestId, 'req1');
        assert.strictEqual(state.checkpoints[1].undoStopId, 'stop1');
        assert.strictEqual(state.checkpoints[1].label, 'Checkpoint 1');
        assert.strictEqual(state.epochCounter, initialEpoch + 1);
    });
    test('createCheckpoint does not create duplicate checkpoints', function () {
        timeline.createCheckpoint('req1', 'stop1', 'Checkpoint 1');
        timeline.createCheckpoint('req1', 'stop1', 'Checkpoint 1 Duplicate');
        const checkpoints = timeline.getStateForPersistence().checkpoints;
        assert.strictEqual(checkpoints.length, 2); // Only initial + first checkpoint
        assert.strictEqual(checkpoints[1].label, 'Checkpoint 1'); // Original label preserved
    });
    test('incrementEpoch increases epoch counter', function () {
        const initialEpoch = timeline.getStateForPersistence().epochCounter;
        const epoch1 = timeline.incrementEpoch();
        const epoch2 = timeline.incrementEpoch();
        assert.strictEqual(epoch1, initialEpoch);
        assert.strictEqual(epoch2, initialEpoch + 1);
        assert.strictEqual(timeline.getStateForPersistence().epochCounter, initialEpoch + 2);
    });
    test('recordFileBaseline stores baseline', function () {
        const uri = URI.parse('file:///test.txt');
        const baseline = upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial content',
            epoch: 1,
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        });
        timeline.recordFileBaseline(baseline);
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req2'), false);
    });
    test('recordFileOperation stores operation', function () {
        const uri = URI.parse('file:///test.txt');
        const operation = createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 1), text: 'hello' }]);
        timeline.recordFileOperation(operation);
        const state = timeline.getStateForPersistence();
        assert.strictEqual(state.operations.length, 1);
        assert.strictEqual(state.operations[0].type, FileOperationType.TextEdit);
        assert.strictEqual(state.operations[0].requestId, 'req1');
    });
    test('basic undo/redo with text edits', async function () {
        const uri = URI.parse('file:///test.txt');
        // Record baseline
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'hello',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        // Create checkpoint before edit - marks state with baseline
        timeline.createCheckpoint('req1', undefined, 'Start of Request');
        // Record edit at a new epoch
        const editEpoch = timeline.incrementEpoch();
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', editEpoch, [{ range: new Range(1, 1, 1, 6), text: 'goodbye' }]));
        // Create checkpoint after edit - marks state with edit applied
        timeline.createCheckpoint('req1', 'stop1', 'After Edit');
        // canUndo and canRedo are based on checkpoint positions, not delegate state
        // We have: Initial, Start of Request, After Edit
        // Current epoch is after 'After Edit', so we can undo but not redo
        assert.strictEqual(timeline.canUndo.get(), true);
        assert.strictEqual(timeline.canRedo.get(), false);
        // Undo (goes to start of request)
        await timeline.undoToLastCheckpoint();
        // After undoing to start of request, we can't undo within this request anymore
        // but we can redo to the 'stop1' checkpoint
        assert.strictEqual(timeline.canUndo.get(), false); // No more undo stops in req1 before this
        assert.strictEqual(timeline.canRedo.get(), true); // Can redo to 'stop1'
        // Redo
        await timeline.redoToNextCheckpoint();
        // After redo to 'stop1', we can undo again
        assert.strictEqual(timeline.canUndo.get(), true);
        // canRedo might still be true if currentEpoch is less than the max epoch
        // This is because checkpoints are created with incrementEpoch, so there are epochs after them
    });
    test('file creation and deletion operations', async function () {
        const uri = URI.parse('file:///new.txt');
        // Create file
        const createEpoch = timeline.incrementEpoch();
        // Record baseline for the created file
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'new file content',
            epoch: createEpoch,
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', createEpoch, 'new file content'));
        // Checkpoint marks state after file creation
        timeline.createCheckpoint('req1', 'created', 'File Created');
        // Navigate to initial to sync delegate, then to created
        await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
        assert.strictEqual(fileContents.has(uri), false);
        // Navigate to created checkpoint
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'created'));
        assert.strictEqual(fileContents.get(uri), 'new file content');
        // Delete file
        const deleteEpoch = timeline.incrementEpoch();
        timeline.recordFileOperation(createFileDeleteOperation(uri, 'req1', deleteEpoch, 'new file content'));
        timeline.createCheckpoint('req1', 'deleted', 'File Deleted');
        // Navigate back to initial, then to deleted to properly apply operations
        await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'deleted'));
        assert.strictEqual(fileContents.has(uri), false);
        // Undo deletion - goes back to 'created' checkpoint
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(fileContents.get(uri), 'new file content');
        // Undo creation - goes back to initial state
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(fileContents.has(uri), false);
    });
    test('file rename operations', async function () {
        const oldUri = URI.parse('file:///old.txt');
        const newUri = URI.parse('file:///new.txt');
        // Create initial file
        const createEpoch = timeline.incrementEpoch();
        // Record baseline for the created file
        timeline.recordFileBaseline(upcastPartial({
            uri: oldUri,
            requestId: 'req1',
            content: 'content',
            epoch: createEpoch,
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createFileCreateOperation(oldUri, 'req1', createEpoch, 'content'));
        timeline.createCheckpoint('req1', 'created', 'File Created');
        // Navigate to initial, then to created to apply create operation
        await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'created'));
        assert.strictEqual(fileContents.get(oldUri), 'content');
        // Rename file
        const renameEpoch = timeline.incrementEpoch();
        timeline.recordFileOperation(createFileRenameOperation(oldUri, newUri, 'req1', renameEpoch));
        timeline.createCheckpoint('req1', 'renamed', 'File Renamed');
        // Navigate back to initial, then to renamed to properly apply operations
        await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'renamed'));
        assert.strictEqual(fileContents.has(oldUri), false);
        assert.strictEqual(fileContents.get(newUri), 'content');
        // Undo rename - goes back to 'created' checkpoint
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(fileContents.get(oldUri), 'content');
        assert.strictEqual(fileContents.has(newUri), false);
    });
    test('multiple sequential edits to same file', async function () {
        const uri = URI.parse('file:///test.txt');
        // Record baseline
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'line1\nline2\nline3',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start');
        // First edit
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 6), text: 'LINE1' }]));
        timeline.createCheckpoint('req1', 'edit1', 'Edit 1');
        // Second edit
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(2, 1, 2, 6), text: 'LINE2' }]));
        timeline.createCheckpoint('req1', 'edit2', 'Edit 2');
        // Navigate to first edit
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'edit1'));
        assert.strictEqual(fileContents.get(uri), 'LINE1\nline2\nline3');
        // Navigate to second edit
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'edit2'));
        assert.strictEqual(fileContents.get(uri), 'LINE1\nLINE2\nline3');
        // Navigate back to start
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', undefined));
        assert.strictEqual(fileContents.get(uri), 'line1\nline2\nline3');
    });
    test('getCheckpointIdForRequest returns correct checkpoint', function () {
        timeline.createCheckpoint('req1', undefined, 'Start of req1');
        timeline.createCheckpoint('req1', 'stop1', 'Stop 1');
        timeline.createCheckpoint('req2', undefined, 'Start of req2');
        const req1Start = timeline.getCheckpointIdForRequest('req1', undefined);
        const req1Stop = timeline.getCheckpointIdForRequest('req1', 'stop1');
        const req2Start = timeline.getCheckpointIdForRequest('req2', undefined);
        assert.ok(req1Start);
        assert.ok(req1Stop);
        assert.ok(req2Start);
        assert.notStrictEqual(req1Start, req1Stop);
        assert.notStrictEqual(req1Start, req2Start);
    });
    test('getCheckpointIdForRequest returns undefined for non-existent checkpoint', function () {
        const checkpoint = timeline.getCheckpointIdForRequest('nonexistent', 'stop1');
        assert.strictEqual(checkpoint, undefined);
    });
    test('requestDisablement tracks disabled requests', async function () {
        const uri = URI.parse('file:///test.txt');
        timeline.createCheckpoint('req1', undefined, 'Start req1');
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', timeline.incrementEpoch(), 'a'));
        timeline.createCheckpoint('req1', 'stop1', 'Stop req1');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 2), text: 'b' }]));
        timeline.createCheckpoint('req2', undefined, 'Start req2');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req2', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 2), text: 'c' }]));
        // Undo sequence:
        assert.deepStrictEqual(timeline.requestDisablement.get(), []);
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(fileContents.get(uri), 'b');
        assert.deepStrictEqual(timeline.requestDisablement.get(), [
            { requestId: 'req2', afterUndoStop: undefined },
        ]);
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(fileContents.get(uri), 'a');
        assert.deepStrictEqual(timeline.requestDisablement.get(), [
            { requestId: 'req2', afterUndoStop: undefined },
            { requestId: 'req1', afterUndoStop: 'stop1' },
        ]);
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(fileContents.get(uri), undefined);
        assert.deepStrictEqual(timeline.requestDisablement.get(), [
            { requestId: 'req2', afterUndoStop: undefined },
            { requestId: 'req1', afterUndoStop: undefined },
        ]);
        // Redo sequence:
        await timeline.redoToNextCheckpoint();
        assert.strictEqual(fileContents.get(uri), 'a');
        assert.deepStrictEqual(timeline.requestDisablement.get(), [
            { requestId: 'req2', afterUndoStop: undefined },
            { requestId: 'req1', afterUndoStop: 'stop1' },
        ]);
        await timeline.redoToNextCheckpoint();
        assert.strictEqual(fileContents.get(uri), 'b');
        assert.deepStrictEqual(timeline.requestDisablement.get(), [
            { requestId: 'req2', afterUndoStop: undefined },
        ]);
        await timeline.redoToNextCheckpoint();
        assert.strictEqual(fileContents.get(uri), 'c');
    });
    test('persistence - save and restore state', function () {
        const uri = URI.parse('file:///test.txt');
        // Setup some state
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 8), text: 'modified' }]));
        timeline.createCheckpoint('req1', 'stop1', 'Edit Complete');
        // Save state
        const savedState = timeline.getStateForPersistence();
        // Create new timeline and restore
        const collection = new ServiceCollection();
        collection.set(INotebookService, new SyncDescriptor(TestNotebookService));
        const insta = store.add(workbenchInstantiationService(undefined, store).createChild(collection));
        const newTimeline = insta.createInstance(ChatEditingCheckpointTimelineImpl, URI.parse('chat://test-session-2'), fileDelegate);
        transaction(tx => {
            newTimeline.restoreFromState(savedState, tx);
        });
        // Verify state was restored
        const restoredState = newTimeline.getStateForPersistence();
        assert.strictEqual(restoredState.checkpoints.length, savedState.checkpoints.length);
        assert.strictEqual(restoredState.operations.length, savedState.operations.length);
        assert.strictEqual(restoredState.currentEpoch, savedState.currentEpoch);
        assert.strictEqual(restoredState.epochCounter, savedState.epochCounter);
    });
    test('navigating between multiple requests', async function () {
        const uri1 = URI.parse('file:///file1.txt');
        const uri2 = URI.parse('file:///file2.txt');
        // Request 1 - create file
        timeline.createCheckpoint('req1', undefined, 'Start req1');
        const create1Epoch = timeline.incrementEpoch();
        timeline.recordFileBaseline(upcastPartial({
            uri: uri1,
            requestId: 'req1',
            content: 'file1 modified',
            epoch: create1Epoch,
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createFileCreateOperation(uri1, 'req1', create1Epoch, 'file1 modified'));
        timeline.createCheckpoint('req1', 'stop1', 'Req1 complete');
        // Request 2 - create another file
        timeline.createCheckpoint('req2', undefined, 'Start req2');
        const create2Epoch = timeline.incrementEpoch();
        timeline.recordFileBaseline(upcastPartial({
            uri: uri2,
            requestId: 'req2',
            content: 'file2 modified',
            epoch: create2Epoch,
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createFileCreateOperation(uri2, 'req2', create2Epoch, 'file2 modified'));
        timeline.createCheckpoint('req2', 'stop1', 'Req2 complete');
        // Navigate to initial, then to req1 completion to apply its operations
        await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'stop1'));
        assert.strictEqual(fileContents.get(uri1), 'file1 modified');
        assert.strictEqual(fileContents.has(uri2), false); // req2 hasn't happened yet
        // Navigate to req2 completion
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req2', 'stop1'));
        assert.strictEqual(fileContents.get(uri1), 'file1 modified');
        assert.strictEqual(fileContents.get(uri2), 'file2 modified');
        // Navigate back to initial state by getting the first checkpoint
        const initialCheckpoint = timeline.getStateForPersistence().checkpoints[0];
        await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
        assert.strictEqual(fileContents.has(uri1), false);
        assert.strictEqual(fileContents.has(uri2), false);
    });
    test('getContentURIAtStop returns snapshot URI', function () {
        const fileUri = URI.parse('file:///test.txt');
        const snapshotUri = timeline.getContentURIAtStop('req1', fileUri, 'stop1');
        assert.ok(snapshotUri);
        assert.notStrictEqual(snapshotUri.toString(), fileUri.toString());
        assert.ok(snapshotUri.toString().includes('req1'));
    });
    test('undoing entire request when appropriate', async function () {
        const uri = URI.parse('file:///test.txt');
        // Create initial baseline and checkpoint
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start req1');
        // Single edit with checkpoint
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 8), text: 'modified' }]));
        timeline.createCheckpoint('req1', 'stop1', 'Edit complete');
        // Should be able to undo
        assert.strictEqual(timeline.canUndo.get(), true);
        // Undo should go back to start of request, not just previous checkpoint
        await timeline.undoToLastCheckpoint();
        // Verify we're at the start of req1, which has epoch 2 (0 = initial, 1 = baseline, 2 = start checkpoint)
        const state = timeline.getStateForPersistence();
        assert.strictEqual(state.currentEpoch, 2); // Should be at the "Start req1" checkpoint epoch
    });
    test('operations use incrementing epochs', function () {
        const uri = URI.parse('file:///test.txt');
        const epoch1 = timeline.incrementEpoch();
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', epoch1, [{ range: new Range(1, 1, 1, 1), text: 'edit1' }]));
        const epoch2 = timeline.incrementEpoch();
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', epoch2, [{ range: new Range(2, 1, 2, 1), text: 'edit2' }]));
        // Both operations should be recorded
        const operations = timeline.getStateForPersistence().operations;
        assert.strictEqual(operations.length, 2);
        assert.strictEqual(operations[0].epoch, epoch1);
        assert.strictEqual(operations[1].epoch, epoch2);
    });
    test('navigateToCheckpoint throws error for invalid checkpoint ID', async function () {
        let errorThrown = false;
        try {
            await timeline.navigateToCheckpoint('invalid-checkpoint-id');
        }
        catch (error) {
            errorThrown = true;
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('not found'));
        }
        assert.ok(errorThrown, 'Expected error to be thrown');
    });
    test('navigateToCheckpoint does nothing when already at target epoch', async function () {
        const uri = URI.parse('file:///test.txt');
        // Record baseline and operation
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        const createEpoch = timeline.incrementEpoch();
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', createEpoch, [{ range: new Range(1, 1, 1, 8), text: 'modified' }]));
        timeline.createCheckpoint('req1', 'stop1', 'Checkpoint');
        // Navigate to checkpoint
        const checkpointId = timeline.getCheckpointIdForRequest('req1', 'stop1');
        await timeline.navigateToCheckpoint(checkpointId);
        // Navigate again to same checkpoint - should be a no-op
        const stateBefore = timeline.getStateForPersistence();
        await timeline.navigateToCheckpoint(checkpointId);
        const stateAfter = timeline.getStateForPersistence();
        assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
    });
    test('recording operation after undo truncates future history', async function () {
        const uri = URI.parse('file:///test.txt');
        // Setup initial operations
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 8), text: 'edit1' }]));
        timeline.createCheckpoint('req1', 'stop1', 'Edit 1');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 6), text: 'edit2' }]));
        timeline.createCheckpoint('req1', 'stop2', 'Edit 2');
        const stateWithTwoEdits = timeline.getStateForPersistence();
        assert.strictEqual(stateWithTwoEdits.operations.length, 2);
        // Undo to stop1
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'stop1'));
        // Record new operation - this should truncate the second edit
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 6), text: 'edit3' }]));
        const stateAfterNewEdit = timeline.getStateForPersistence();
        assert.strictEqual(stateAfterNewEdit.operations.length, 2);
        assert.strictEqual(stateAfterNewEdit.operations[1].type, FileOperationType.TextEdit);
        // The second operation should be the new edit3, not edit2
    });
    test('redo after recording new operation should work', async function () {
        const uri = URI.parse('file:///test.txt');
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 8), text: 'edit1' }]));
        timeline.createCheckpoint('req1', 'stop1', 'Edit 1');
        // Undo
        await timeline.undoToLastCheckpoint();
        assert.strictEqual(timeline.canRedo.get(), true);
        // Redo
        await timeline.redoToNextCheckpoint();
        // After redo, canRedo depends on whether we're at the latest epoch
        // Since we created a checkpoint after the operation, currentEpoch is ahead
        // of the checkpoint epoch, so canRedo may still be true
        assert.strictEqual(timeline.canUndo.get(), true);
    });
    test('redo when there is no checkpoint after operation', async function () {
        const uri = URI.parse('file:///test.txt');
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start');
        // Record operation but don't create checkpoint after it
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 8), text: 'edit1' }]));
        // Undo to start
        const startCheckpoint = timeline.getCheckpointIdForRequest('req1', undefined);
        await timeline.navigateToCheckpoint(startCheckpoint);
        // Should be able to redo even without a checkpoint after the operation
        assert.strictEqual(timeline.canRedo.get(), true);
        await timeline.redoToNextCheckpoint();
        // After redo, we should be at the operation's epoch + 1
        const state = timeline.getStateForPersistence();
        assert.ok(state.currentEpoch > 1);
    });
    test('getContentAtStop returns empty for non-existent file', async function () {
        const uri = URI.parse('file:///nonexistent.txt');
        const content = await timeline.getContentAtStop('req1', uri, 'stop1');
        assert.strictEqual(content, '');
    });
    test('getContentAtStop with epoch-based stopId', async function () {
        const uri = URI.parse('file:///test.txt');
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        const editEpoch = timeline.incrementEpoch();
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', editEpoch, [{ range: new Range(1, 1, 1, 8), text: 'modified' }]));
        // Use epoch-based stop ID
        const content = await timeline.getContentAtStop('req1', uri, `__epoch_${editEpoch + 1}`);
        assert.ok(content);
        assert.strictEqual(content, 'modified');
    });
    test('hasFileBaseline correctly reports baseline existence', function () {
        const uri = URI.parse('file:///test.txt');
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), false);
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'initial',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req2'), false);
    });
    test('hasFileBaseline returns true for files with create operations', function () {
        const uri = URI.parse('file:///created.txt');
        // Initially, no baseline
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), false);
        // Record a create operation without recording an explicit baseline
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', timeline.incrementEpoch(), 'created content'));
        // hasFileBaseline should now return true because of the create operation
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req2'), false);
    });
    test('hasFileBaseline distinguishes between different request IDs for create operations', function () {
        const uri = URI.parse('file:///created.txt');
        // Record a create operation for req1
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', timeline.incrementEpoch(), 'content from req1'));
        // hasFileBaseline should only return true for req1
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req2'), false);
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req3'), false);
    });
    test('hasFileBaseline returns true when both baseline and create operation exist', function () {
        const uri = URI.parse('file:///test.txt');
        // Record both a baseline and a create operation
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'baseline content',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', timeline.incrementEpoch(), 'created content'));
        // Should return true (checking either source)
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
    });
    test('hasFileBaseline with create operation followed by edit', function () {
        const uri = URI.parse('file:///created-and-edited.txt');
        // Record a create operation
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', timeline.incrementEpoch(), 'initial content'));
        // hasFileBaseline should return true
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
        // Record an edit operation on the created file
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 16), text: 'edited content' }]));
        // hasFileBaseline should still return true
        assert.strictEqual(timeline.hasFileBaseline(uri, 'req1'), true);
    });
    test('multiple text edits to same file are properly replayed', async function () {
        const uri = URI.parse('file:///test.txt');
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'line1\nline2\nline3',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', undefined, 'Start');
        // First edit - uppercase line 1
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 6), text: 'LINE1' }]));
        // Second edit - uppercase line 2
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(2, 1, 2, 6), text: 'LINE2' }]));
        // Third edit - uppercase line 3
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(3, 1, 3, 6), text: 'LINE3' }]));
        timeline.createCheckpoint('req1', 'all-edits', 'All edits');
        // Navigate to see all edits applied
        const initialCheckpoint = timeline.getStateForPersistence().checkpoints[0];
        await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'all-edits'));
        assert.strictEqual(fileContents.get(uri), 'LINE1\nLINE2\nLINE3');
    });
    test('checkpoint with same requestId and undoStopId is not duplicated', function () {
        timeline.createCheckpoint('req1', 'stop1', 'First');
        timeline.createCheckpoint('req1', 'stop1', 'Second'); // Should be ignored
        const checkpoints = timeline.getStateForPersistence().checkpoints;
        const req1Stop1Checkpoints = checkpoints.filter(c => c.requestId === 'req1' && c.undoStopId === 'stop1');
        assert.strictEqual(req1Stop1Checkpoints.length, 1);
        assert.strictEqual(req1Stop1Checkpoints[0].label, 'First');
    });
    test('finding baseline after file rename operation', async function () {
        const oldUri = URI.parse('file:///old.txt');
        const newUri = URI.parse('file:///new.txt');
        // Create baseline for old URI
        timeline.recordFileBaseline(upcastPartial({
            uri: oldUri,
            requestId: 'req1',
            content: 'initial content',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        // Edit the file before rename (replace entire content)
        timeline.recordFileOperation(createTextEditOperation(oldUri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 16), text: 'modified content' }]));
        // Rename operation
        timeline.recordFileOperation(createFileRenameOperation(oldUri, newUri, 'req1', timeline.incrementEpoch()));
        timeline.createCheckpoint('req1', 'renamed', 'After rename');
        // Get content at the renamed URI - should find the baseline through rename chain
        const content = await timeline.getContentAtStop('req1', newUri, 'renamed');
        assert.strictEqual(content, 'modified content');
    });
    test('baseline lookup across different request IDs', async function () {
        const uri = URI.parse('file:///test.txt');
        // First request baseline
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'req1 content',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 13), text: 'req1 modified' }]));
        // Second request baseline
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req2',
            content: 'req2 content',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.recordFileOperation(createTextEditOperation(uri, 'req2', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 13), text: 'req2 modified' }]));
        timeline.createCheckpoint('req2', 'stop1', 'Req2 checkpoint');
        // Getting content should use req2 baseline
        const content = await timeline.getContentAtStop('req2', uri, 'stop1');
        assert.strictEqual(content, 'req2 modified');
    });
    test('getContentAtStop with file that does not exist in operations', async function () {
        const uri = URI.parse('file:///test.txt');
        timeline.recordFileBaseline(upcastPartial({
            uri,
            requestId: 'req1',
            content: 'content',
            epoch: timeline.incrementEpoch(),
            telemetryInfo: DEFAULT_TELEMETRY_INFO
        }));
        timeline.createCheckpoint('req1', 'stop1', 'Checkpoint');
        // Try to get content for a different URI that doesn't have any operations
        const differentUri = URI.parse('file:///different.txt');
        const content = await timeline.getContentAtStop('req1', differentUri, 'stop1');
        assert.strictEqual(content, '');
    });
    test('undoToLastCheckpoint when canUndo is false does nothing', async function () {
        // At initial state, canUndo should be false
        assert.strictEqual(timeline.canUndo.get(), false);
        const stateBefore = timeline.getStateForPersistence();
        await timeline.undoToLastCheckpoint();
        const stateAfter = timeline.getStateForPersistence();
        // Should not have changed
        assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
    });
    test('redoToNextCheckpoint when canRedo is false does nothing', async function () {
        // At initial state with no future operations, canRedo should be false
        assert.strictEqual(timeline.canRedo.get(), false);
        const stateBefore = timeline.getStateForPersistence();
        await timeline.redoToNextCheckpoint();
        const stateAfter = timeline.getStateForPersistence();
        // Should not have changed
        assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
    });
    test('orphaned operations and checkpoints are removed after undo and new changes', async function () {
        const uri = URI.parse('file:///test.txt');
        // Create the file first
        const createEpoch = timeline.incrementEpoch();
        timeline.recordFileOperation(createFileCreateOperation(uri, 'req1', createEpoch, 'initial content'));
        timeline.createCheckpoint('req1', undefined, 'Start req1');
        // First set of changes
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 16), text: 'first edit' }]));
        timeline.createCheckpoint('req1', 'stop1', 'First Edit');
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 11), text: 'second edit' }]));
        timeline.createCheckpoint('req1', 'stop2', 'Second Edit');
        // Verify we have 3 operations (create + 2 edits) and 4 checkpoints (initial, start, stop1, stop2)
        let state = timeline.getStateForPersistence();
        assert.strictEqual(state.operations.length, 3);
        assert.strictEqual(state.checkpoints.length, 4);
        // Undo to stop1 (before second edit)
        await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest('req1', 'stop1'));
        // Record a new operation - this should truncate the "second edit" operation
        // and remove the stop2 checkpoint
        timeline.recordFileOperation(createTextEditOperation(uri, 'req1', timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 11), text: 'replacement edit' }]));
        timeline.createCheckpoint('req1', 'stop2-new', 'Replacement Edit');
        // Verify the orphaned operation and checkpoint are gone
        state = timeline.getStateForPersistence();
        assert.strictEqual(state.operations.length, 3, 'Should still have 3 operations (create + first + replacement)');
        assert.strictEqual(state.checkpoints.length, 4, 'Should have 4 checkpoints (initial, start, stop1, stop2-new)');
        // Verify the third operation is the replacement, not the original second edit
        const thirdOp = state.operations[2];
        assert.strictEqual(thirdOp.type, FileOperationType.TextEdit);
        if (thirdOp.type === FileOperationType.TextEdit) {
            assert.strictEqual(thirdOp.edits[0].text, 'replacement edit');
        }
        // Verify the stop2-new checkpoint exists, not stop2
        const stop2NewCheckpoint = timeline.getCheckpointIdForRequest('req1', 'stop2-new');
        const stop2OldCheckpoint = timeline.getCheckpointIdForRequest('req1', 'stop2');
        assert.ok(stop2NewCheckpoint, 'New checkpoint should exist');
        assert.strictEqual(stop2OldCheckpoint, undefined, 'Old orphaned checkpoint should be removed');
        // Now navigate through the entire timeline to verify consistency
        const initialCheckpoint = state.checkpoints[0];
        const startCheckpoint = timeline.getCheckpointIdForRequest('req1', undefined);
        const stop1Checkpoint = timeline.getCheckpointIdForRequest('req1', 'stop1');
        const stop2NewCheckpointId = timeline.getCheckpointIdForRequest('req1', 'stop2-new');
        // Navigate to initial to clear everything
        await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
        assert.strictEqual(fileContents.has(uri), false);
        // Navigate to start - file should be created
        await timeline.navigateToCheckpoint(startCheckpoint);
        assert.strictEqual(fileContents.get(uri), 'initial content');
        // Navigate to stop1 - first edit should be applied
        await timeline.navigateToCheckpoint(stop1Checkpoint);
        assert.strictEqual(fileContents.get(uri), 'first edit');
        // Navigate to stop2-new - replacement edit should be applied, NOT the orphaned "second edit"
        await timeline.navigateToCheckpoint(stop2NewCheckpointId);
        assert.strictEqual(fileContents.get(uri), 'replacement edit');
        // Navigate back to start
        await timeline.navigateToCheckpoint(startCheckpoint);
        assert.strictEqual(fileContents.get(uri), 'initial content');
        // Navigate forward through all checkpoints again to ensure redo works correctly
        await timeline.navigateToCheckpoint(stop1Checkpoint);
        assert.strictEqual(fileContents.get(uri), 'first edit');
        await timeline.navigateToCheckpoint(stop2NewCheckpointId);
        assert.strictEqual(fileContents.get(uri), 'replacement edit', 'Orphaned edit should never reappear');
        // Go back to initial and forward again to thoroughly test
        await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
        await timeline.navigateToCheckpoint(stop2NewCheckpointId);
        assert.strictEqual(fileContents.get(uri), 'replacement edit', 'Content should still be correct after full timeline traversal');
    });
    test('undo/redo with multiple no-edit requests advances one request at a time', async function () {
        // req1: no edits
        timeline.createCheckpoint('req1', undefined, 'Start req1');
        // req2: no edits
        timeline.createCheckpoint('req2', undefined, 'Start req2');
        // req3: no edits
        timeline.createCheckpoint('req3', undefined, 'Start req3');
        // req4: no edits
        timeline.createCheckpoint('req4', undefined, 'Start req4');
        // Undo should step one request at a time
        assert.strictEqual(timeline.canUndo.get(), true);
        await timeline.undoToLastCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4']);
        await timeline.undoToLastCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4', 'req3']);
        await timeline.undoToLastCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4', 'req3', 'req2']);
        await timeline.undoToLastCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4', 'req3', 'req2', 'req1']);
        assert.strictEqual(timeline.canUndo.get(), false);
        // Redo should also step one request at a time (not skip all at once)
        assert.strictEqual(timeline.canRedo.get(), true);
        await timeline.redoToNextCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4', 'req3', 'req2']);
        await timeline.redoToNextCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4', 'req3']);
        await timeline.redoToNextCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), ['req4']);
        await timeline.redoToNextCheckpoint();
        assert.deepStrictEqual(timeline.requestDisablement.get().map(d => d.requestId), []);
        assert.strictEqual(timeline.canRedo.get(), false);
    });
});
// Mock notebook service for tests that don't need notebook functionality
class TestNotebookService {
    getNotebookTextModel() { return undefined; }
    hasSupportedNotebooks() { return false; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUNBQWlDLEVBQWtDLE1BQU0sbUVBQW1FLENBQUM7QUFDdEosT0FBTyxFQUFpQixpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBR3pHLEtBQUssQ0FBQywrQkFBK0IsRUFBRTtJQUV0QyxNQUFNLEtB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