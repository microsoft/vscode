/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet, setsEqual } from '../../../../../base/common/map.js';
import { observableValue, derived, IObservable, derivedOpts } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IOperationHistoryManager, IOperationCheckpoint, IWorkspaceStateTracker, IWorkspaceSnapshot, IOperationCheckpointData } from './chatEditingSessionV2.js';
import { IChatEditOperation, ChatOperationGroup, IOperationResult } from './chatEditingSessionV2Operations.js';

export const enum ChatEditOperationState {
	/** Operation has not been actioned by the user yet/ */
	Pending,
	/** Operation has been accepted by the user. */
	Accepted,
	/** Operation has been rejected by the user. */
	Rejected,
}

interface IChatEditOptionRecord {
	op: IChatEditOperation;
	state: IObservable<ChatEditOperationState>;
}

/**
 * Implementation of operation history manager.
 */
export class OperationHistoryManager implements IOperationHistoryManager {
	private readonly _operations = observableValue<IChatEditOptionRecord[]>(this, []);
	private readonly _currentPosition = observableValue(this, 0);
	private readonly _checkpoints: IOperationCheckpoint[] = [];

	private readonly _canUndo = derived(this, reader => this._currentPosition.read(reader) > 0);
	private readonly _canRedo = derived(this, reader => this._currentPosition.read(reader) < this._operations.read(reader).length);

	public readonly filesWithPendingOperations = derivedOpts<ResourceSet>({ debugName: 'filesWithPendingOperations', equalsFn: setsEqual }, reader => {
		const ops = this._operations.read(reader);
		const pendingFiles = new ResourceSet();
		for (const record of ops) {
			if (record.state.read(reader) === ChatEditOperationState.Pending) {
				for (const resource of record.op.getAffectedResources()) {
					pendingFiles.add(resource);
				}
			}
		}
		return pendingFiles;
	});

	constructor(
		private readonly _workspaceTracker: IWorkspaceStateTracker,
	) { }

	addOperation(operation: IChatEditOperation): void {
		// Remove any operations after the current position (if we're in the middle of history)
		const operations = this._operations.get();
		const newOperations = operations.slice(0, this._currentPosition.get());

		// Add the new operation
		const operationRecord: IChatEditOptionRecord = {
			op: operation,
			state: observableValue(this, ChatEditOperationState.Pending),
		};
		newOperations.push(operationRecord);
		this._operations.set(newOperations, undefined);
		this._currentPosition.set(newOperations.length, undefined);
	}

	addOperationGroup(operations: readonly IChatEditOperation[], description: string): void {
		const group = new ChatOperationGroup(
			operations[0]?.requestId || 'unknown',
			operations,
			description
		);
		this.addOperation(group);
	}

	getAllOperations(): readonly IChatEditOperation[] {
		return this._operations.get().map(record => record.op);
	}

	getAllOperationRecords(): readonly IChatEditOptionRecord[] {
		return this._operations.get();
	}

	get operations(): IObservable<readonly IChatEditOptionRecord[]> {
		return this._operations;
	}

	getOperationsForRequest(requestId: string): readonly IChatEditOperation[] {
		return this._operations.get().filter(record => record.op.requestId === requestId).map(record => record.op);
	}

	getOperationsForResource(uri: URI): readonly IChatEditOperation[] {
		return this._operations.get().filter(record =>
			record.op.getAffectedResources().some(resource => resource.toString() === uri.toString())
		).map(record => record.op);
	}

	async goToOperation(operationId: string): Promise<IOperationResult[]> {
		const operations = this._operations.get();
		const targetIndex = operations.findIndex(record => record.op.id === operationId);
		if (targetIndex === -1) {
			throw new Error(`Operation not found: ${operationId}`);
		}

		const results: IOperationResult[] = [];
		const targetPosition = targetIndex + 1; // Position is 1-based (after the operation)
		const currentPosition = this._currentPosition.get();

		if (targetPosition < currentPosition) {
			// Need to undo: revert operations from current position back to target
			for (let i = currentPosition - 1; i >= targetIndex; i--) {
				const operation = operations[i].op;
				const result = await operation.revert();
				results.push(result);

				if (!result.success) {
					break;
				}

				// Update workspace state for affected resources
				for (const resource of result.modifiedResources) {
					await this._workspaceTracker.updateFileState(resource);
				}
			}
			this._currentPosition.set(targetPosition, undefined);
		} else if (targetPosition > currentPosition) {
			// Need to redo: apply operations from current position forward to target
			for (let i = currentPosition; i <= targetIndex; i++) {
				const operation = operations[i].op;
				const result = await operation.apply();
				results.push(result);

				if (!result.success) {
					break;
				}

				// Update workspace state for affected resources
				for (const resource of result.modifiedResources) {
					await this._workspaceTracker.updateFileState(resource);
				}
			}
			this._currentPosition.set(targetPosition, undefined);
		}
		// If targetPosition === currentPosition, we're already at the target, no-op

		return results;
	}

	get canUndo(): IObservable<boolean> {
		return this._canUndo;
	}

	get canRedo(): IObservable<boolean> {
		return this._canRedo;
	}

	async createCheckpoint(): Promise<IOperationCheckpoint> {
		const currentPosition = this._currentPosition.get();
		const operations = this._operations.get();
		const operationId = currentPosition > 0 ?
			operations[currentPosition - 1].op.id : 'initial';
		const workspaceSnapshot = await this._workspaceTracker.createSnapshot();

		const checkpoint = new OperationCheckpoint(operationId, workspaceSnapshot, Date.now());
		this._checkpoints.push(checkpoint);

		return checkpoint;
	}

	async rollbackToCheckpoint(checkpoint: IOperationCheckpoint): Promise<void> {
		await this._workspaceTracker.restoreSnapshot(checkpoint.workspaceSnapshot);

		// Find the operation position for this checkpoint
		const operations = this._operations.get();
		const operationIndex = operations.findIndex(record => record.op.id === checkpoint.operationId);
		this._currentPosition.set(operationIndex >= 0 ? operationIndex + 1 : 0, undefined);
	}

	async optimizeHistory(): Promise<void> {
		// TODO: Implement operation squashing and optimization
		// This could include:
		// - Combining consecutive text edits on the same file
		// - Removing redundant create/delete operations
		// - Squashing rename chains
	}
}

/**
 * Implementation of operation checkpoint.
 */
export class OperationCheckpoint implements IOperationCheckpoint {
	constructor(
		public readonly operationId: string,
		public readonly workspaceSnapshot: IWorkspaceSnapshot,
		public readonly timestamp: number
	) { }

	async serialize(): Promise<IOperationCheckpointData> {
		return {
			operationId: this.operationId,
			workspaceSnapshot: await this.workspaceSnapshot.serialize(),
			timestamp: this.timestamp
		};
	}
}
