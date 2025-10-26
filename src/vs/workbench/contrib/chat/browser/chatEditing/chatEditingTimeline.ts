/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



import { equals as arraysEqual, binarySearch2 } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { DisposableStore, thenRegisterOrDispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { derived, derivedOpts, IObservable, ITransaction, ObservablePromise, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IEditSessionEntryDiff, ISnapshotEntry } from '../../common/chatEditingService.js';
import { IChatRequestDisablement } from '../../common/chatModel.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedNotebookEntry } from './chatEditingModifiedNotebookEntry.js';
import { IChatEditingSessionSnapshot, IChatEditingSessionStop } from './chatEditingSessionStorage.js';
import { ChatEditingModifiedNotebookDiff } from './notebook/chatEditingModifiedNotebookDiff.js';

/**
 * Timeline/undo-redo stack for ChatEditingSession.
 */
export class ChatEditingTimeline {
	public static readonly POST_EDIT_STOP_ID = 'd19944f6-f46c-4e17-911b-79a8e843c7c0'; // randomly generated
	public static createEmptySnapshot(undoStop: string | undefined): IChatEditingSessionStop {
		return {
			stopId: undoStop,
			entries: new ResourceMap(),
		};
	}

	private readonly _linearHistory = observableValue<readonly IChatEditingSessionSnapshot[]>(this, []);
	private readonly _linearHistoryIndex = observableValue<number>(this, 0);

	private readonly _diffsBetweenStops = new Map<string, IObservable<IEditSessionEntryDiff | undefined>>();
	private readonly _fullDiffs = new Map<string, IObservable<IEditSessionEntryDiff | undefined>>();
	private readonly _ignoreTrimWhitespaceObservable: IObservable<boolean>;

	public readonly canUndo: IObservable<boolean>;
	public readonly canRedo: IObservable<boolean>;

	public readonly requestDisablement = derivedOpts<IChatRequestDisablement[]>({ equalsFn: (a, b) => arraysEqual(a, b, objectsEqual) }, reader => {
		const history = this._linearHistory.read(reader);
		const index = this._linearHistoryIndex.read(reader);
		const undoRequests: IChatRequestDisablement[] = [];
		for (const entry of history) {
			if (!entry.requestId) {
				// ignored
			} else if (entry.startIndex >= index) {
				undoRequests.push({ requestId: entry.requestId });
			} else if (entry.startIndex + entry.stops.length > index) {
				undoRequests.push({ requestId: entry.requestId, afterUndoStop: entry.stops[(index - 1) - entry.startIndex].stopId });
			}
		}
		return undoRequests;
	});

	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		this._ignoreTrimWhitespaceObservable = observableConfigValue('diffEditor.ignoreTrimWhitespace', true, configurationService);

		this.canUndo = derived(r => {
			const linearHistoryIndex = this._linearHistoryIndex.read(r);
			return linearHistoryIndex > 1;
		});
		this.canRedo = derived(r => {
			const linearHistoryIndex = this._linearHistoryIndex.read(r);
			return linearHistoryIndex < getMaxHistoryIndex(this._linearHistory.read(r));
		});
	}

	/**
	 * Restore the timeline from a saved state (history array and index).
	 */
	public restoreFromState(state: { history: readonly IChatEditingSessionSnapshot[]; index: number }, tx: ITransaction): void {
		this._linearHistory.set(state.history, tx);
		this._linearHistoryIndex.set(state.index, tx);
	}

	/**
	 * Get the snapshot and history index for restoring, given requestId and stopId.
	 * If requestId is undefined, returns undefined (pending snapshot is managed by session).
	 */
	public getSnapshotForRestore(requestId: string | undefined, stopId: string | undefined): { stop: IChatEditingSessionStop; apply(): void } | undefined {
		if (requestId === undefined) {
			return undefined;
		}
		const stopRef = this.findEditStop(requestId, stopId);
		if (!stopRef) {
			return undefined;
		}

		// When rolling back to the first snapshot taken for a request, mark the
		// entire request as undone.
		const toIndex = stopRef.stop.stopId === undefined ? stopRef.historyIndex : stopRef.historyIndex + 1;
		return {
			stop: stopRef.stop,
			apply: () => this._linearHistoryIndex.set(toIndex, undefined)
		};
	}

	/**
	 * Ensures the state of the file in the given snapshot matches the current
	 * state of the {@param entry}. This is used to handle concurrent file edits.
	 *
	 * Given the case of two different edits, we will place and undo stop right
	 * before we `textEditGroup` in the underlying markdown stream, but at the
	 * time those are added the edits haven't been made yet, so both files will
	 * simply have the unmodified state.
	 *
	 * This method is called after each edit, so after the first file finishes
	 * being edits, it will update its content in the second undo snapshot such
	 * that it can be undone successfully.
	 *
	 * We ensure that the same file is not concurrently edited via the
	 * {@link _streamingEditLocks}, avoiding race conditions.
	 *
	 * @param next If true, this will edit the snapshot _after_ the undo stop
	 */
	public ensureEditInUndoStopMatches(
		requestId: string,
		undoStop: string | undefined,
		entry: Pick<AbstractChatEditingModifiedFileEntry, 'modifiedURI' | 'createSnapshot' | 'equalsSnapshot'>,
		next: boolean,
		tx: ITransaction | undefined
	) {
		const history = this._linearHistory.get();
		const snapIndex = history.findIndex((s) => s.requestId === requestId);
		if (snapIndex === -1) {
			return;
		}

		const snap = { ...history[snapIndex] };
		let stopIndex = snap.stops.findIndex((s) => s.stopId === undoStop);
		if (stopIndex === -1) {
			return;
		}

		let linearHistoryIndexIncr = 0;
		if (next) {
			if (stopIndex === snap.stops.length - 1) {
				if (snap.stops[stopIndex].stopId === ChatEditingTimeline.POST_EDIT_STOP_ID) {
					throw new Error('cannot duplicate post-edit stop');
				}

				snap.stops = snap.stops.concat(ChatEditingTimeline.createEmptySnapshot(ChatEditingTimeline.POST_EDIT_STOP_ID));
				linearHistoryIndexIncr++;
			}
			stopIndex++;
		}

		const stop = snap.stops[stopIndex];
		if (entry.equalsSnapshot(stop.entries.get(entry.modifiedURI))) {
			return;
		}

		const newMap = new ResourceMap(stop.entries);
		newMap.set(entry.modifiedURI, entry.createSnapshot(requestId, stop.stopId));

		const newStop = snap.stops.slice();
		newStop[stopIndex] = { ...stop, entries: newMap };
		snap.stops = newStop;

		const newHistory = history.slice();
		newHistory[snapIndex] = snap;

		this._linearHistory.set(newHistory, tx);
		if (linearHistoryIndexIncr) {
			this._linearHistoryIndex.set(this._linearHistoryIndex.get() + linearHistoryIndexIncr, tx);
		}
	}

	/**
	 * Get the undo snapshot (previous in history), or undefined if at start.
	 * If the timeline is at the end of the history, it will return the last stop
	 * pushed into the history.
	 */
	public getUndoSnapshot(): { stop: IChatEditingSessionStop; apply(): void } | undefined {
		return this.getUndoRedoSnapshot(-1);
	}

	/**
	 * Get the redo snapshot (next in history), or undefined if at end.
	 */
	public getRedoSnapshot(): { stop: IChatEditingSessionStop; apply(): void } | undefined {
		return this.getUndoRedoSnapshot(1);
	}

	private getUndoRedoSnapshot(direction: number) {
		let idx = this._linearHistoryIndex.get() - 1;
		const max = getMaxHistoryIndex(this._linearHistory.get());
		const startEntry = this.getHistoryEntryByLinearIndex(idx);
		let entry = startEntry;
		if (!startEntry) {
			return undefined;
		}

		do {
			idx += direction;
			entry = this.getHistoryEntryByLinearIndex(idx);
		} while (
			idx + direction < max &&
			idx + direction >= 0 &&
			entry &&
			!(direction === -1 && entry.entry.requestId !== startEntry.entry.requestId) &&
			!stopProvidesNewData(startEntry.stop, entry.stop)
		);

		if (entry) {
			return { stop: entry.stop, apply: () => this._linearHistoryIndex.set(idx + 1, undefined) };
		}

		return undefined;
	}

	/**
	 * Get the state for persistence (history and index).
	 */
	public getStateForPersistence(): { history: readonly IChatEditingSessionSnapshot[]; index: number } {
		return { history: this._linearHistory.get(), index: this._linearHistoryIndex.get() };
	}

	private findSnapshot(requestId: string): IChatEditingSessionSnapshot | undefined {
		return this._linearHistory.get().find((s) => s.requestId === requestId);
	}

	private findEditStop(requestId: string, undoStop: string | undefined) {
		const snapshot = this.findSnapshot(requestId);
		if (!snapshot) {
			return undefined;
		}
		const idx = snapshot.stops.findIndex((s) => s.stopId === undoStop);
		return idx === -1 ? undefined : { stop: snapshot.stops[idx], snapshot, historyIndex: snapshot.startIndex + idx };
	}

	private getHistoryEntryByLinearIndex(index: number) {
		const history = this._linearHistory.get();
		const searchedIndex = binarySearch2(history.length, (e) => history[e].startIndex - index);
		const entry = history[searchedIndex < 0 ? (~searchedIndex) - 1 : searchedIndex];
		if (!entry || index - entry.startIndex >= entry.stops.length) {
			return undefined;
		}
		return {
			entry,
			stop: entry.stops[index - entry.startIndex]
		};
	}

	public pushSnapshot(requestId: string, undoStop: string | undefined, snapshot: IChatEditingSessionStop) {
		const linearHistoryPtr = this._linearHistoryIndex.get();
		const newLinearHistory: IChatEditingSessionSnapshot[] = [];
		for (const entry of this._linearHistory.get()) {
			if (entry.startIndex >= linearHistoryPtr) {
				break;
			} else if (linearHistoryPtr - entry.startIndex < entry.stops.length) {
				newLinearHistory.push({ requestId: entry.requestId, stops: entry.stops.slice(0, linearHistoryPtr - entry.startIndex), startIndex: entry.startIndex });
			} else {
				newLinearHistory.push(entry);
			}
		}

		const lastEntry = newLinearHistory.at(-1);
		if (requestId && lastEntry?.requestId === requestId) {
			const hadPostEditStop = lastEntry.stops.at(-1)?.stopId === ChatEditingTimeline.POST_EDIT_STOP_ID && undoStop;
			if (hadPostEditStop) {
				const rebaseUri = (uri: URI) => uri.with({ query: uri.query.replace(ChatEditingTimeline.POST_EDIT_STOP_ID, undoStop) });
				for (const [uri, prev] of lastEntry.stops.at(-1)!.entries) {
					snapshot.entries.set(uri, { ...prev, snapshotUri: rebaseUri(prev.snapshotUri), resource: rebaseUri(prev.resource) });
				}
			}
			newLinearHistory[newLinearHistory.length - 1] = {
				...lastEntry,
				stops: [...hadPostEditStop ? lastEntry.stops.slice(0, -1) : lastEntry.stops, snapshot]
			};
		} else {
			newLinearHistory.push({ requestId, startIndex: lastEntry ? lastEntry.startIndex + lastEntry.stops.length : 0, stops: [snapshot] });
		}

		transaction((tx) => {
			const last = newLinearHistory[newLinearHistory.length - 1];
			this._linearHistory.set(newLinearHistory, tx);
			this._linearHistoryIndex.set(last.startIndex + last.stops.length, tx);
		});
	}

	/**
	 * Gets diff for text entries between stops.
	 * @param entriesContent Observable that observes either snapshot entry
	 * @param modelUrisObservable Observable that observes only the snapshot URIs.
	 */
	private _entryDiffBetweenTextStops(
		entriesContent: IObservable<{ before: ISnapshotEntry; after: ISnapshotEntry } | undefined>,
		modelUrisObservable: IObservable<[URI, URI] | undefined>,
	): IObservable<ObservablePromise<IEditSessionEntryDiff> | undefined> {
		const modelRefsPromise = derived(this, (reader) => {
			const modelUris = modelUrisObservable.read(reader);
			if (!modelUris) { return undefined; }

			const store = reader.store.add(new DisposableStore());
			const promise = Promise.all(modelUris.map(u => this._textModelService.createModelReference(u))).then(refs => {
				if (store.isDisposed) {
					refs.forEach(r => r.dispose());
				} else {
					refs.forEach(r => store.add(r));
				}

				return refs;
			});

			return new ObservablePromise(promise);
		});

		return derived((reader): ObservablePromise<IEditSessionEntryDiff> | undefined => {
			const refs2 = modelRefsPromise.read(reader)?.promiseResult.read(reader);
			const refs = refs2?.data;
			if (!refs) {
				return;
			}

			const entries = entriesContent.read(reader); // trigger re-diffing when contents change

			if (entries?.before && ChatEditingModifiedNotebookEntry.canHandleSnapshot(entries.before)) {
				const diffService = this._instantiationService.createInstance(ChatEditingModifiedNotebookDiff, entries.before, entries.after);
				return new ObservablePromise(diffService.computeDiff());

			}
			const ignoreTrimWhitespace = this._ignoreTrimWhitespaceObservable.read(reader);
			const promise = this._computeDiff(refs[0].object.textEditorModel.uri, refs[1].object.textEditorModel.uri, ignoreTrimWhitespace);

			return new ObservablePromise(promise);
		});
	}

	private _createDiffBetweenStopsObservable(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> {
		const entries = derivedOpts<undefined | { before: ISnapshotEntry; after: ISnapshotEntry }>(
			{
				equalsFn: (a, b) => snapshotsEqualForDiff(a?.before, b?.before) && snapshotsEqualForDiff(a?.after, b?.after),
			},
			reader => {
				const stops = requestId ?
					getCurrentAndNextStop(requestId, stopId, this._linearHistory.read(reader)) :
					getFirstAndLastStop(uri, this._linearHistory.read(reader));
				if (!stops) { return undefined; }
				const before = stops.current.get(uri);
				const after = stops.next.get(uri);
				if (!before || !after) { return undefined; }
				return { before, after };
			},
		);

		// Separate observable for model refs to avoid unnecessary disposal
		const modelUrisObservable = derivedOpts<[URI, URI] | undefined>({ equalsFn: (a, b) => arraysEqual(a, b, isEqual) }, reader => {
			const entriesValue = entries.read(reader);
			if (!entriesValue) { return undefined; }
			return [entriesValue.before.snapshotUri, entriesValue.after.snapshotUri];
		});

		const diff = this._entryDiffBetweenTextStops(entries, modelUrisObservable);

		return derived(reader => {
			return diff.read(reader)?.promiseResult.read(reader)?.data || undefined;
		});
	}

	public getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined) {
		if (requestId) {
			const key = `${uri}\0${requestId}\0${stopId}`;
			let observable = this._diffsBetweenStops.get(key);
			if (!observable) {
				observable = this._createDiffBetweenStopsObservable(uri, requestId, stopId);
				this._diffsBetweenStops.set(key, observable);
			}

			return observable;
		} else {
			const key = uri.toString();
			let observable = this._fullDiffs.get(key);
			if (!observable) {
				observable = this._createDiffBetweenStopsObservable(uri, requestId, stopId);
				this._fullDiffs.set(key, observable);
			}

			return observable;
		}
	}

	public getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> {
		const snapshotUris = derivedOpts<[URI | undefined, URI | undefined]>(
			{ equalsFn: (a, b) => arraysEqual(a, b, isEqual) },
			reader => {
				const history = this._linearHistory.read(reader);
				const firstSnapshotUri = this._getFirstSnapshotForUriAfterRequest(history, uri, startRequestId, true);
				const lastSnapshotUri = this._getFirstSnapshotForUriAfterRequest(history, uri, stopRequestId, false);
				return [firstSnapshotUri, lastSnapshotUri];
			},
		);
		const modelRefs = derived((reader) => {
			const snapshots = snapshotUris.read(reader);
			const firstSnapshotUri = snapshots[0];
			const lastSnapshotUri = snapshots[1];
			if (!firstSnapshotUri || !lastSnapshotUri) {
				return;
			}
			const store = new DisposableStore();
			reader.store.add(store);
			const referencesPromise = Promise.all([firstSnapshotUri, lastSnapshotUri].map(u => {
				return thenRegisterOrDispose(this._textModelService.createModelReference(u), store);
			}));
			return new ObservablePromise(referencesPromise);
		});
		const diff = derived((reader): ObservablePromise<IEditSessionEntryDiff> | undefined => {
			const references = modelRefs.read(reader)?.promiseResult.read(reader);
			const refs = references?.data;
			if (!refs) {
				return;
			}
			const ignoreTrimWhitespace = this._ignoreTrimWhitespaceObservable.read(reader);
			const promise = this._computeDiff(refs[0].object.textEditorModel.uri, refs[1].object.textEditorModel.uri, ignoreTrimWhitespace);
			return new ObservablePromise(promise);
		});
		return derived(reader => {
			return diff.read(reader)?.promiseResult.read(reader)?.data || undefined;
		});
	}

	private _computeDiff(originalUri: URI, modifiedUri: URI, ignoreTrimWhitespace: boolean): Promise<IEditSessionEntryDiff> {
		return this._editorWorkerService.computeDiff(
			originalUri,
			modifiedUri,
			{ ignoreTrimWhitespace, computeMoves: false, maxComputationTimeMs: 3000 },
			'advanced'
		).then((diff): IEditSessionEntryDiff => {
			const entryDiff: IEditSessionEntryDiff = {
				originalURI: originalUri,
				modifiedURI: modifiedUri,
				identical: !!diff?.identical,
				quitEarly: !diff || diff.quitEarly,
				added: 0,
				removed: 0,
			};
			if (diff) {
				for (const change of diff.changes) {
					entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
					entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
				}
			}
			return entryDiff;
		});
	}

	private _getFirstSnapshotForUriAfterRequest(history: readonly IChatEditingSessionSnapshot[], uri: URI, requestId: string, inclusive: boolean): URI | undefined {
		const requestIndex = history.findIndex(s => s.requestId === requestId);
		if (requestIndex === -1) { return undefined; }
		const processedIndex = requestIndex + (inclusive ? 0 : 1);
		for (let i = processedIndex; i < history.length; i++) {
			const snapshot = history[i];
			for (const stop of snapshot.stops) {
				const entry = stop.entries.get(uri);
				if (entry) {
					return entry.snapshotUri;
				}
			}
		}
		return uri;
	}
}

function stopProvidesNewData(origin: IChatEditingSessionStop, target: IChatEditingSessionStop) {
	return Iterable.some(target.entries, ([uri, e]) => origin.entries.get(uri)?.current !== e.current);
}

function getMaxHistoryIndex(history: readonly IChatEditingSessionSnapshot[]) {
	const lastHistory = history.at(-1);
	return lastHistory ? lastHistory.startIndex + lastHistory.stops.length : 0;
}

function snapshotsEqualForDiff(a: ISnapshotEntry | undefined, b: ISnapshotEntry | undefined) {
	if (!a || !b) {
		return a === b;
	}

	return isEqual(a.snapshotUri, b.snapshotUri) && a.current === b.current;
}

function getCurrentAndNextStop(requestId: string, stopId: string | undefined, history: readonly IChatEditingSessionSnapshot[]) {
	const snapshotIndex = history.findIndex(s => s.requestId === requestId);
	if (snapshotIndex === -1) { return undefined; }
	const snapshot = history[snapshotIndex];
	const stopIndex = snapshot.stops.findIndex(s => s.stopId === stopId);
	if (stopIndex === -1) { return undefined; }

	const currentStop = snapshot.stops[stopIndex];
	const current = currentStop.entries;
	const nextStop = stopIndex < snapshot.stops.length - 1
		? snapshot.stops[stopIndex + 1]
		: undefined;
	if (!nextStop) {
		return undefined;
	}

	return { current, currentStopId: currentStop.stopId, next: nextStop.entries, nextStopId: nextStop.stopId };
}

function getFirstAndLastStop(uri: URI, history: readonly IChatEditingSessionSnapshot[]) {
	let firstStopWithUri: IChatEditingSessionStop | undefined;
	for (const snapshot of history) {
		const stop = snapshot.stops.find(s => s.entries.has(uri));
		if (stop) {
			firstStopWithUri = stop;
			break;
		}
	}

	let lastStopWithUri: ResourceMap<ISnapshotEntry> | undefined;
	let lastStopWithUriId: string | undefined;
	for (let i = history.length - 1; i >= 0; i--) {
		const snapshot = history[i];
		const stop = findLast(snapshot.stops, s => s.entries.has(uri));
		if (stop) {
			lastStopWithUri = stop.entries;
			lastStopWithUriId = stop.stopId;
			break;
		}
	}

	if (!firstStopWithUri || !lastStopWithUri) {
		return undefined;
	}

	return { current: firstStopWithUri.entries, currentStopId: firstStopWithUri.stopId, next: lastStopWithUri, nextStopId: lastStopWithUriId! };
}
