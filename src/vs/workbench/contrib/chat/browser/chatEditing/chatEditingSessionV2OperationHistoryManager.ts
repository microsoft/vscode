/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap, ResourceSet, setsEqual } from '../../../../../base/common/map.js';
import { derived, derivedOpts, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ChatEditOperationState, IGetOperationsFilter, IOperationCheckpoint, IOperationCheckpointData, IOperationHistoryManager } from './chatEditingSessionV2.js';
import { ChatOperationGroup, ChatOperationResultAggregator, IChatEditOperation, IOperationResult } from './chatEditingSessionV2Operations.js';

export interface IChatEditOptionRecord {
	op: IChatEditOperation;
	state: ISettableObservable<ChatEditOperationState>;
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

	public get operations() {
		return this._operations;
	}

	constructor(@ITextModelService private readonly _textModelService: ITextModelService) { }

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

	public async undo(): Promise<IOperationResult> {
		const ops = this._operations.get();
		const pos = this._currentPosition.get();

		if (pos <= 0 || ops.length === 0) {
			return new ChatOperationResultAggregator();
		}

		const targetIndex = Math.max(0, pos - 2);
		return this.goToOperation(ops[targetIndex].op.id);
	}

	public async redo(): Promise<IOperationResult> {
		const ops = this._operations.get();
		const pos = this._currentPosition.get();

		if (pos >= ops.length) {
			return new ChatOperationResultAggregator();
		}

		return this.goToOperation(ops[pos].op.id);
	}

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

	async accept(operation: readonly IChatEditOperation[]): Promise<IOperationResult> {
		const agg = new ChatOperationResultAggregator();
		const ids = new Set(operation.map(op => op.id));
		const toAccept: IChatEditOptionRecord[] = [];

		for (const op of this._operations.get()) {
			if (op.state.get() !== ChatEditOperationState.Pending) {
				continue;
			}

			if (!op.op.isApplied) {
				const result = await op.op.apply();
				agg.add(result);
				if (!result.success) {
					break;
				}
			}

			if (!ids || ids.has(op.op.id)) {
				toAccept.push(op);
			}
		}

		transaction(tx => {
			for (const op of toAccept) {
				op.state.set(ChatEditOperationState.Accepted, tx);
			}
		});

		return agg;
	}

	async reject(operation: readonly IChatEditOperation[]): Promise<IOperationResult> {
		const agg = new ChatOperationResultAggregator();
		const ids = new Set(operation.map(op => op.id));
		const toReject: IChatEditOptionRecord[] = [];

		const allOps = this._operations.get();
		for (let i = allOps.length - 1; i >= 0; i--) {
			const op = allOps[i];
			if (op.state.get() !== ChatEditOperationState.Pending) {
				continue;
			}

			if (op.op.isApplied) {
				const result = await op.op.revert();
				agg.add(result);
				if (!result.success) {
					break;
				}
			}

			if (ids.has(op.op.id)) {
				toReject.push(op);
			}
		}

		transaction(tx => {
			for (const op of toReject) {
				op.state.set(ChatEditOperationState.Rejected, tx);
			}
		});

		return agg;
	}

	getAllOperationRecords(): readonly IChatEditOptionRecord[] {
		return this._operations.get();
	}

	getOperations(filter: IGetOperationsFilter): IChatEditOperation[] {
		const uriSet = filter.affectsResource?.length && new ResourceSet(filter.affectsResource);
		return this._operations.get().filter(record =>
			(filter.inState === undefined || record.state.get() === filter.inState) &&
			(!uriSet || record.op.getAffectedResources().some(resource => uriSet.has(resource)))
		).map(record => record.op);
	}

	async goToOperation(operationId: string): Promise<IOperationResult> {
		const operations = this._operations.get();
		const targetIndex = operations.findIndex(record => record.op.id === operationId);
		if (targetIndex === -1) {
			throw new Error(`Operation not found: ${operationId}`);
		}

		const results = new ChatOperationResultAggregator();
		const targetPosition = targetIndex + 1; // Position is 1-based (after the operation)
		const currentPosition = this._currentPosition.get();

		if (targetPosition < currentPosition) {
			// Need to undo: revert operations from current position back to target
			for (let i = currentPosition - 1; i >= targetIndex; i--) {
				const operation = operations[i].op;
				const result = await operation.revert();
				results.add(result);

				if (!result.success) {
					break;
				}
			}
			this._currentPosition.set(targetPosition, undefined);
		} else if (targetPosition > currentPosition) {
			// Need to redo: apply operations from current position forward to target
			for (let i = currentPosition; i <= targetIndex; i++) {
				const operation = operations[i].op;
				const result = await operation.apply();
				results.add(result);

				if (!result.success) {
					break;
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

	async createCheckpoint(includeURIs: ResourceSet, requestId: string, checkpointId?: string): Promise<IOperationCheckpoint> {
		const currentPosition = this._currentPosition.get();
		const operations = this._operations.get();
		const operationId = currentPosition > 0 ?
			operations[currentPosition - 1].op.id : 'initial';

		const resourceContents = new ResourceMap<string>();
		await Promise.all([...includeURIs].map(async r => {
			const ref = await this._textModelService.createModelReference(r);
			resourceContents.set(r, ref.object.textEditorModel.getValue());
			ref.dispose();
		}));

		const checkpoint = new OperationCheckpoint(requestId, checkpointId, operationId, resourceContents);
		this._checkpoints.push(checkpoint);

		return checkpoint;
	}

	findCheckpoint(requestId: string, checkpointId?: string): IOperationCheckpoint | undefined {
		return this._checkpoints.find(checkpoint =>
			checkpoint.requestId === requestId && checkpoint.checkpointId === checkpointId
		);
	}

	getCheckpointsForRequest(requestId: string): readonly IOperationCheckpoint[] {
		return this._checkpoints.filter(checkpoint => checkpoint.requestId === requestId);
	}

	async rollbackToCheckpoint(checkpoint: IOperationCheckpoint): Promise<void> {
		await this.goToOperation(checkpoint.operationId);
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
		public readonly requestId: string,
		public readonly checkpointId: string | undefined,
		public readonly operationId: string,
		public readonly resources: ResourceMap<string>,
	) { }

	async serialize(): Promise<IOperationCheckpointData> {
		return {
			requestId: this.requestId,
			checkpointId: this.checkpointId,
			operationId: this.operationId,
			resources: [...this.resources].map(([uri, content]) => ({ uri: uri.toString(), content })),
		};
	}
}
