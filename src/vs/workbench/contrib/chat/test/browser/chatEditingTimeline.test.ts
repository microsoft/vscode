/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatEditingTimeline } from '../../browser/chatEditing/chatEditingTimeline.js';
import { IChatEditingSessionStop } from '../../browser/chatEditing/chatEditingSessionStorage.js';
import { transaction } from '../../../../../base/common/observable.js';

suite('ChatEditingTimeline', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let timeline: ChatEditingTimeline;

	setup(() => {
		const instaService = workbenchInstantiationService(undefined, ds);
		timeline = instaService.createInstance(ChatEditingTimeline);
	});

	suite('undo/redo', () => {
		test('undo/redo with empty history', () => {
			assert.strictEqual(timeline.getUndoSnapshot(), undefined);
			assert.strictEqual(timeline.getRedoSnapshot(), undefined);
			assert.strictEqual(timeline.canRedo.get(), false);
			assert.strictEqual(timeline.canUndo.get(), false);
		});
	});

	function createSnapshot(stopId = 'stop', entries?: any): IChatEditingSessionStop {
		return {
			stopId,
			entries: entries || new Map(),
		};
	}

	suite('Basic functionality', () => {
		test('pushSnapshot and undo/redo navigation', () => {
			// Push two snapshots
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));

			// After two pushes, canUndo should be true, canRedo false
			assert.strictEqual(timeline.canUndo.get(), true);
			assert.strictEqual(timeline.canRedo.get(), false);

			// Undo should move back to stop1
			const undoSnap = timeline.getUndoSnapshot();
			assert.ok(undoSnap);
			assert.strictEqual(undoSnap.stop.stopId, 'stop1');
			undoSnap.apply();
			assert.strictEqual(timeline.canUndo.get(), false);
			assert.strictEqual(timeline.canRedo.get(), true);

			// Redo should move forward to stop2
			const redoSnap = timeline.getRedoSnapshot();
			assert.ok(redoSnap);
			assert.strictEqual(redoSnap.stop.stopId, 'stop2');
			redoSnap.apply();
			assert.strictEqual(timeline.canUndo.get(), true);
			assert.strictEqual(timeline.canRedo.get(), false);
		});

		test('restoreFromState restores history and index', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			const state = timeline.getStateForPersistence();

			// Move back
			timeline.getUndoSnapshot()?.apply();

			// Restore state
			transaction(tx => timeline.restoreFromState(state, tx));
			assert.strictEqual(timeline.canUndo.get(), true);
			assert.strictEqual(timeline.canRedo.get(), false);
		});

		test('getSnapshotForRestore returns correct snapshot', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));

			const snap = timeline.getSnapshotForRestore('req1', 'stop1');
			assert.ok(snap);
			assert.strictEqual(snap.stop.stopId, 'stop1');
			snap.apply();

			assert.strictEqual(timeline.canRedo.get(), true);
			assert.strictEqual(timeline.canUndo.get(), false);

			const snap2 = timeline.getSnapshotForRestore('req1', 'stop2');
			assert.ok(snap2);
			assert.strictEqual(snap2.stop.stopId, 'stop2');
			snap2.apply();

			assert.strictEqual(timeline.canRedo.get(), false);
			assert.strictEqual(timeline.canUndo.get(), true);
		});

		test('getRequestDisablement returns correct requests', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));

			// Move back to first
			timeline.getUndoSnapshot()?.apply();

			const disables = timeline.getRequestDisablement();
			assert.ok(Array.isArray(disables));
			assert.ok(disables.some(d => d.requestId === 'req2'));
		});
	});

	suite('Multiple requests', () => {
		test('handles multiple requests with separate snapshots', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req3', 'stop3', createSnapshot('stop3'));

			assert.strictEqual(timeline.canUndo.get(), true);
			assert.strictEqual(timeline.canRedo.get(), false);

			// Undo should go back through requests
			let undoSnap = timeline.getUndoSnapshot();
			assert.ok(undoSnap);
			assert.strictEqual(undoSnap.stop.stopId, 'stop2');
			undoSnap.apply();

			undoSnap = timeline.getUndoSnapshot();
			assert.ok(undoSnap);
			assert.strictEqual(undoSnap.stop.stopId, 'stop1');
		});

		test('handles same request with multiple stops', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req1', 'stop3', createSnapshot('stop3'));

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history.length, 1);
			assert.strictEqual(state.history[0].stops.length, 3);
			assert.strictEqual(state.history[0].requestId, 'req1');
		});

		test('mixed requests and stops', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req2', 'stop3', createSnapshot('stop3'));
			timeline.pushSnapshot('req2', 'stop4', createSnapshot('stop4'));

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history.length, 2);
			assert.strictEqual(state.history[0].stops.length, 2);
			assert.strictEqual(state.history[1].stops.length, 2);
		});
	});

	suite('Edge cases', () => {
		test('getSnapshotForRestore with non-existent request', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));

			const snap = timeline.getSnapshotForRestore('nonexistent', 'stop1');
			assert.strictEqual(snap, undefined);
		});

		test('getSnapshotForRestore with non-existent stop', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));

			const snap = timeline.getSnapshotForRestore('req1', 'nonexistent');
			assert.strictEqual(snap, undefined);
		});
	});

	suite('History manipulation', () => {
		test('pushing snapshots after undo truncates future history', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req1', 'stop3', createSnapshot('stop3'));

			// Undo twice
			timeline.getUndoSnapshot()?.apply();
			timeline.getUndoSnapshot()?.apply();

			// Push new snapshot - should truncate stop3
			timeline.pushSnapshot('req1', 'new_stop', createSnapshot('new_stop'));

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history[0].stops.length, 2); // stop1 + new_stop
			assert.strictEqual(state.history[0].stops[1].stopId, 'new_stop');
		});

		test('branching from middle of history creates new branch', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req3', 'stop3', createSnapshot('stop3'));

			// Undo to middle
			timeline.getUndoSnapshot()?.apply();

			// Push new request
			timeline.pushSnapshot('req4', 'stop4', createSnapshot('stop4'));

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history.length, 3); // req1, req2, req4
			assert.strictEqual(state.history[2].requestId, 'req4');
		});
	});

	suite('State persistence', () => {
		test('getStateForPersistence returns complete state', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));

			const state = timeline.getStateForPersistence();
			assert.ok(state.history);
			assert.ok(typeof state.index === 'number');
			assert.strictEqual(state.history.length, 2);
			assert.strictEqual(state.index, 2);
		});

		test('restoreFromState handles empty history', () => {
			const emptyState = { history: [], index: 0 };

			transaction(tx => timeline.restoreFromState(emptyState, tx));

			assert.strictEqual(timeline.canUndo.get(), false);
			assert.strictEqual(timeline.canRedo.get(), false);
		});

		test('restoreFromState with complex history', () => {
			// Create complex state
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req2', 'stop3', createSnapshot('stop3'));

			const originalState = timeline.getStateForPersistence();

			// Create new timeline and restore
			const instaService = workbenchInstantiationService(undefined, ds);
			const newTimeline = instaService.createInstance(ChatEditingTimeline);
			transaction(tx => newTimeline.restoreFromState(originalState, tx));

			const restoredState = newTimeline.getStateForPersistence();
			assert.deepStrictEqual(restoredState.index, originalState.index);
			assert.strictEqual(restoredState.history.length, originalState.history.length);
		});
	});

	suite('Request disablement', () => {
		test('getRequestDisablement at various positions', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req3', 'stop3', createSnapshot('stop3'));

			// At end - no disabled requests
			let disables = timeline.getRequestDisablement();
			assert.strictEqual(disables.length, 0);

			// Move back one
			timeline.getUndoSnapshot()?.apply();
			disables = timeline.getRequestDisablement();
			assert.strictEqual(disables.length, 1);
			assert.strictEqual(disables[0].requestId, 'req3');

			// Move back to beginning
			timeline.getUndoSnapshot()?.apply();
			timeline.getUndoSnapshot()?.apply();
			disables = timeline.getRequestDisablement();
			assert.strictEqual(disables.length, 2);
		});

		test('getRequestDisablement with mixed request/stop structure', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req2', 'stop3', createSnapshot('stop3'));

			// Move to middle of req1
			timeline.getUndoSnapshot()?.apply();
			timeline.getUndoSnapshot()?.apply();

			const disables = timeline.getRequestDisablement();
			assert.strictEqual(disables.length, 2);

			// Should have partial disable for req1 and full disable for req2
			const req1Disable = disables.find(d => d.requestId === 'req1');
			const req2Disable = disables.find(d => d.requestId === 'req2');

			assert.ok(req1Disable);
			assert.ok(req2Disable);
			assert.ok(req1Disable.afterUndoStop);
			assert.strictEqual(req2Disable.afterUndoStop, undefined);
		});
	});

	suite('Boundary conditions', () => {
		test('undo/redo at boundaries', () => {
			// Empty timeline
			assert.strictEqual(timeline.getUndoSnapshot(), undefined);
			assert.strictEqual(timeline.getRedoSnapshot(), undefined);

			// Single snapshot
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			assert.ok(timeline.getUndoSnapshot());
			assert.strictEqual(timeline.getRedoSnapshot(), undefined);

			// At beginning after undo
			timeline.getUndoSnapshot()?.apply();
			assert.strictEqual(timeline.getUndoSnapshot(), undefined);
			assert.ok(timeline.getRedoSnapshot());
		});

		test('multiple undos and redos', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));
			timeline.pushSnapshot('req3', 'stop3', createSnapshot('stop3'));

			// Undo all
			const stops: string[] = [];
			let undoSnap = timeline.getUndoSnapshot();
			while (undoSnap) {
				stops.push(undoSnap.stop.stopId!);
				undoSnap.apply();
				undoSnap = timeline.getUndoSnapshot();
			}
			assert.deepStrictEqual(stops, ['stop2', 'stop1']);

			// Redo all
			const redoStops: string[] = [];
			let redoSnap = timeline.getRedoSnapshot();
			while (redoSnap) {
				redoStops.push(redoSnap.stop.stopId!);
				redoSnap.apply();
				redoSnap = timeline.getRedoSnapshot();
			}
			assert.deepStrictEqual(redoStops, ['stop2', 'stop3']);
		});
	});

	suite('Static methods', () => {
		test('createEmptySnapshot creates valid snapshot', () => {
			const snapshot = ChatEditingTimeline.createEmptySnapshot('test-stop');
			assert.strictEqual(snapshot.stopId, 'test-stop');
			assert.ok(snapshot.entries);
			assert.strictEqual(snapshot.entries.size, 0);
		});

		test('createEmptySnapshot with undefined stopId', () => {
			const snapshot = ChatEditingTimeline.createEmptySnapshot(undefined);
			assert.strictEqual(snapshot.stopId, undefined);
			assert.ok(snapshot.entries);
		});

		test('POST_EDIT_STOP_ID is consistent', () => {
			assert.strictEqual(typeof ChatEditingTimeline.POST_EDIT_STOP_ID, 'string');
			assert.ok(ChatEditingTimeline.POST_EDIT_STOP_ID.length > 0);
		});
	});

	suite('Observable behavior', () => {
		test('canUndo observable updates correctly', () => {
			assert.strictEqual(timeline.canUndo.get(), false);

			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			assert.strictEqual(timeline.canUndo.get(), true);

			timeline.getUndoSnapshot()?.apply();
			assert.strictEqual(timeline.canUndo.get(), false);
		});

		test('canRedo observable updates correctly', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));
			assert.strictEqual(timeline.canRedo.get(), false);

			timeline.getUndoSnapshot()?.apply();
			assert.strictEqual(timeline.canRedo.get(), true);

			timeline.getRedoSnapshot()?.apply();
			assert.strictEqual(timeline.canRedo.get(), false);
		});
	});

	suite('Complex scenarios', () => {
		test('interleaved requests and undos', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req2', 'stop2', createSnapshot('stop2'));

			// Undo req2
			timeline.getUndoSnapshot()?.apply();

			// Add req3 (should branch from req1)
			timeline.pushSnapshot('req3', 'stop3', createSnapshot('stop3'));

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history.length, 2); // req1, req3
			assert.strictEqual(state.history[1].requestId, 'req3');
		});

		test('large number of snapshots', () => {
			// Push 100 snapshots
			for (let i = 1; i <= 100; i++) {
				timeline.pushSnapshot(`req${i}`, `stop${i}`, createSnapshot(`stop${i}`));
			}

			assert.strictEqual(timeline.canUndo.get(), true);
			assert.strictEqual(timeline.canRedo.get(), false);

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history.length, 100);
			assert.strictEqual(state.index, 100);
		});

		test('alternating single and multi-stop requests', () => {
			// Single stop request
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));

			// Multi-stop request
			timeline.pushSnapshot('req2', 'stop2a', createSnapshot('stop2a'));
			timeline.pushSnapshot('req2', 'stop2b', createSnapshot('stop2b'));
			timeline.pushSnapshot('req2', 'stop2c', createSnapshot('stop2c'));

			// Single stop request
			timeline.pushSnapshot('req3', 'stop3', createSnapshot('stop3'));

			const state = timeline.getStateForPersistence();
			assert.strictEqual(state.history.length, 3);
			assert.strictEqual(state.history[0].stops.length, 1);
			assert.strictEqual(state.history[1].stops.length, 3);
			assert.strictEqual(state.history[2].stops.length, 1);
		});
	});

	suite('Error resilience', () => {
		test('handles invalid apply calls gracefully', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));
			timeline.pushSnapshot('req1', 'stop2', createSnapshot('stop2'));

			const undoSnap = timeline.getUndoSnapshot();
			assert.ok(undoSnap);

			// Apply twice - second should be safe
			undoSnap.apply();
			undoSnap.apply(); // Should not throw

			assert.strictEqual(timeline.canUndo.get(), false);
		});

		test('getSnapshotForRestore with malformed stopId', () => {
			timeline.pushSnapshot('req1', 'stop1', createSnapshot('stop1'));

			const snap = timeline.getSnapshotForRestore('req1', '');
			assert.strictEqual(snap, undefined);
		});

		test('handles restoration edge cases', () => {
			const emptyState = { history: [], index: 0 };
			transaction(tx => timeline.restoreFromState(emptyState, tx));

			// Should be safe to call methods on empty timeline
			assert.strictEqual(timeline.getUndoSnapshot(), undefined);
			assert.strictEqual(timeline.getRedoSnapshot(), undefined);
			assert.deepStrictEqual(timeline.getRequestDisablement(), []);
		});
	});
});
