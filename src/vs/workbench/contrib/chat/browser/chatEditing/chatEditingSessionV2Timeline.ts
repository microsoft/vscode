/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatEditingSessionV2, IOperationCheckpoint, IOperationHistoryManager, IWorkspaceStateTracker } from './chatEditingSessionV2.js';
import { IChatEditOperation, IOperationResult, ChatTextEditOperation } from './chatEditingSessionV2Operations.js';
import { OperationHistoryManager, WorkspaceStateTracker } from './chatEditingSessionV2State.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IStreamingEdits } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { DeferredPromise, Sequencer } from '../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../base/common/map.js';

/**
 * The main ChatEditingSessionV2 class that coordinates all operations.
 */
export class ChatEditingSessionV2 implements IChatEditingSessionV2 {
	private readonly _workspaceTracker: IWorkspaceStateTracker;
	private readonly _operationHistory: IOperationHistoryManager;
	private readonly _instantiationService: IInstantiationService;

	private readonly _streamingEditSequencers = new ResourceMap<Sequencer>();
	private readonly _individualEditSequencers = new ResourceMap<Sequencer>();

	public readonly chatSessionId: string;
	public readonly isGlobalEditingSession: boolean;

	constructor(
		opts: { sessionId: string; isGlobalEditingSession: boolean },
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._instantiationService = instantiationService;
		this._workspaceTracker = instantiationService.createInstance(WorkspaceStateTracker);
		this._operationHistory = new OperationHistoryManager(this._workspaceTracker);
		this.chatSessionId = opts.sessionId;
		this.isGlobalEditingSession = opts.isGlobalEditingSession;
	}

	/**
	 * Get the workspace state tracker.
	 */
	get workspaceTracker(): IWorkspaceStateTracker {
		return this._workspaceTracker;
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
			obtainLock(getEditSequencer(uri, this._individualEditSequencers))
		));

		try {
			const result = await operation.apply();

			if (result.success) {
				this._operationHistory.addOperation(operation);

				// Update workspace state for affected resources
				for (const resource of result.modifiedResources) {
					await this._workspaceTracker.updateFileState(resource);
				}
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

				// Update workspace state for affected resources
				for (const resource of result.modifiedResources) {
					await this._workspaceTracker.updateFileState(resource);
				}
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
	async goToOperation(operationId: string): Promise<IOperationResult[]> {
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
		const lock = obtainLock(getEditSequencer(resource, this._streamingEditSequencers));

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
	dispose(): void {
		// Clean up all streaming edit sequencers
		this._streamingEditSequencers.clear();
		// TODO: Implement proper cleanup for other resources
	}
}


function getEditSequencer(resource: URI, fromMap: ResourceMap<Sequencer>) {
	let sequencer = fromMap.get(resource);
	if (!sequencer) {
		sequencer = new Sequencer();
		fromMap.set(resource, sequencer);
	}

	return sequencer;
}

async function obtainLock(sequencer: Sequencer) {
	const done = new DeferredPromise<void>();
	const ready = new DeferredPromise<{ done: DeferredPromise<void>; dequeued: Promise<void> }>();
	const dequeued = sequencer.queue(() => {
		setImmediate(() => ready.complete({ done, dequeued }));
		return done.p;
	});

	return ready.p;
}
