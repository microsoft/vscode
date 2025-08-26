/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, autorunIterableDelta, IObservable, IReader, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { iterateObservableChanges } from '../../../editTelemetry/browser/helpers/utils.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IModifiedFileEntry, IStreamingEdits } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatEditingSessionV2, IOperationCheckpoint, IOperationHistoryManager } from './chatEditingSessionV2.js';
import { AbstractChatEditingV2ModifiedFileEntry } from './chatEditingSessionV2ModifiedFileEntry.js';
import { OperationHistoryManager } from './chatEditingSessionV2OperationHistoryManager.js';
import { ChatTextEditOperation, IChatEditOperation, IOperationResult } from './chatEditingSessionV2Operations.js';
import { WorkspaceStateTracker } from './chatEditingSessionV2State.js';

/**
 * The main ChatEditingSessionV2 class that coordinates all operations.
 */
export class ChatEditingSessionV2 extends Disposable implements IChatEditingSessionV2 {
	private readonly _operationHistory: IOperationHistoryManager;
	private readonly _instantiationService: IInstantiationService;

	private readonly _streamingEditSequencers = new ObservableResourceMutex<IChatResponseModel>();
	private readonly _individualEditSequencers = new ObservableResourceMutex<void>();

	private readonly _entriesMap = new ResourceMap<AbstractChatEditingV2ModifiedFileEntry>();
	private readonly _entries = observableValue<readonly IModifiedFileEntry[]>('chatEditEntries', []);
	public entries: IObservable<readonly IModifiedFileEntry[]> = this._entries;

	private readonly _onDidDispose = new Emitter<void>();
	public readonly onDidDispose = this._onDidDispose.event;

	public readonly chatSessionId: string;
	public readonly isGlobalEditingSession: boolean;

	constructor(
		opts: { sessionId: string; isGlobalEditingSession: boolean },
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._instantiationService = instantiationService;

		const operationHistory = new OperationHistoryManager();
		this._operationHistory = operationHistory;
		this.chatSessionId = opts.sessionId;
		this.isGlobalEditingSession = opts.isGlobalEditingSession;

		this._register(autorunIterableDelta(
			reader => operationHistory.filesWithPendingOperations.read(reader),
			({ addedValues, removedValues }) => {
				for (const uri of removedValues) {
					this._entriesMap.get(uri)?.dispose();
					this._entriesMap.delete(uri);
				}

				for (const uri of addedValues) {
					this._entriesMap.set(uri, this._instantiationService.createInstance(
						AbstractChatEditingV2ModifiedFileEntry,
						this.chatSessionId + uri,
						uri,
						this._streamingEditSequencers.heldLocksFor(uri),
						operationHistory,
					));
				}

				this._entries.set([...this._entriesMap.values()], undefined);
			},
			uri => uri.toString(),
		));
	}

	getEntry(uri: URI) {
		return this._entriesMap.get(uri);
	}

	readEntry(uri: URI, reader?: IReader): IModifiedFileEntry | undefined {
		return this._entries.read(reader)?.find(entry => entry.modifiedURI.toString() === uri.toString());
	}

	/**
	 * Get the operation history manager.
	 */
	get operationHistory(): IOperationHistoryManager {
		return this._operationHistory;
	}

	/**
	 * Apply a single operation.
	 */
	async applyOperation(operation: IChatEditOperation): Promise<IOperationResult> {
		const locks = await Promise.all(operation.getAffectedResources().map(uri =>
			this._individualEditSequencers.getDeferredLock(uri)
		));

		try {
			const result = await operation.apply();

			if (result.success) {
				this._operationHistory.addOperation(operation);
			}

			return result;
		} finally {
			locks.forEach(l => l.done.complete());
		}
	}

	/**
	 * Apply a group of operations.
	 */
	async applyOperationGroup(operations: readonly IChatEditOperation[], description: string): Promise<IOperationResult[]> {
		const results: IOperationResult[] = [];
		const succeededOperations: IChatEditOperation[] = [];

		// Apply operations one by one
		for (const operation of operations) {
			const result = await operation.apply();
			results.push(result);

			if (result.success) {
				succeededOperations.push(operation);
			} else {
				// If an operation fails, revert all previously succeeded operations
				for (let i = succeededOperations.length - 1; i >= 0; i--) {
					await succeededOperations[i].revert();
				}
				break;
			}
		}

		// If all operations succeeded, add them as a group
		if (succeededOperations.length === operations.length) {
			this._operationHistory.addOperationGroup(operations, description);
		}

		return results;
	}

	/**
	 * Go to a specific operation in the history.
	 */
	async goToOperation(operationId: string): Promise<IOperationResult> {
		return this._operationHistory.goToOperation(operationId);
	}

	/**
	 * Create a checkpoint of the current state.
	 */
	async createCheckpoint(): Promise<IOperationCheckpoint> {
		return this._operationHistory.createCheckpoint();
	}

	/**
	 * Rollback to a specific checkpoint.
	 */
	async rollbackToCheckpoint(checkpoint: IOperationCheckpoint): Promise<void> {
		return this._operationHistory.rollbackToCheckpoint(checkpoint);
	}

	/**
	 * Get all operations for a specific request.
	 */
	getOperationsForRequest(requestId: string): readonly IChatEditOperation[] {
		return this._operationHistory.getOperationsForRequest(requestId);
	}

	/**
	 * Get all operations that affect a specific resource.
	 */
	getOperationsForResource(uri: URI): readonly IChatEditOperation[] {
		return this._operationHistory.getOperationsForResource(uri);
	}

	/**
	 * Get observables for undo/redo availability.
	 */
	get canUndo(): IObservable<boolean> {
		return this._operationHistory.canUndo;
	}

	get canRedo(): IObservable<boolean> {
		return this._operationHistory.canRedo;
	}

	/**
	 * Optimize the operation history.
	 */
	async optimizeHistory(): Promise<void> {
		return this._operationHistory.optimizeHistory();
	}

	/**
	 * Start streaming edits for a resource.
	 * Returns an IStreamingEdits object that can be used to push edits as they arrive.
	 */
	startStreamingEdits(resource: URI, responseModel: IChatResponseModel, inUndoStop: string | undefined): IStreamingEdits {
		// Get or create sequencer for this resource to ensure edits are applied in order
		const lock = this._streamingEditSequencers.getDeferredLock(resource, responseModel);

		return {
			pushText: async (edits: TextEdit[], isLastEdits: boolean) => {
				const operation = this._instantiationService.createInstance(
					ChatTextEditOperation,
					responseModel.requestId,
					resource,
					edits, // Create a copy
					true
				);

				await lock;
				return this.applyOperation(operation);
			},

			pushNotebookCellText: (cell: URI, edits: TextEdit[], isLastEdits: boolean) => {
				//todo
			},

			pushNotebook: (edits: ICellEditOperation[], isLastEdits: boolean) => {
				//todo
			},

			complete: async () => {
				const { done, dequeued } = await lock;
				done.complete();
				await dequeued;

				// todo: mark that the file is not being edited any more

			}
		};
	}

	/**
	 * Dispose of the session and clean up resources.
	 */
	override dispose(): void {
		this._onDidDispose.fire();
		this._streamingEditSequencers.clear();
		this._individualEditSequencers.clear();
		super.dispose();
	}
}

class ObservableResourceMutex<M> {
	private signal = observableSignal(this);
	private readonly _value = new ResourceMap<{ meta: M; fn: () => Promise<unknown> }[]>();

	public heldLocksFor(resource: URI) {
		return this.signal.map(() => this._value.get(resource)?.map(a => a.meta) || []);
	}

	public getDeferredLock<T>(resource: URI, meta: M) {
		const done = new DeferredPromise<void>();
		const ready = new DeferredPromise<{ done: DeferredPromise<void>; dequeued: Promise<void> }>();
		const dequeued = this.lock(resource, meta, () => {
			setImmediate(() => ready.complete({ done, dequeued }));
			return done.p;
		});

		return ready.p;
	}

	public lock<T>(resource: URI, meta: M, fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const rec = this._value.get(resource) || [];
			rec.push({ meta, fn: () => fn().then(resolve, reject) });

			if (rec.length === 1) {
				this._value.set(resource, rec);
				this.dequeue(resource);
			}

			this.signal.trigger(undefined);
		});
	}

	public clear() {
		this._value.clear();
	}

	private async dequeue(resource: URI) {
		while (true) {
			const queue = this._value.get(resource);
			if (!queue?.length) {
				return;
			}

			try {
				await queue[0].fn();
			} finally {
				queue.shift();
				if (queue.length === 0) {
					this._value.delete(resource);
				}
				this.signal.trigger(undefined);
			}
		}
	}
}
