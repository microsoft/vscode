/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { ResourceMap, ResourceSet, setsEqual } from '../../../../../base/common/map.js';
import { derived, derivedOpts, IObservable, IReader, ISettableObservable, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit as EditorTextEdit } from '../../../../../editor/common/core/edits/textEdit.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ChatEditOperationState, IGetOperationsFilter, IOperationCheckpoint, IOperationCheckpointData, IOperationCheckpointPointer, IOperationHistoryManager } from './chatEditingSessionV2.js';
import { ChatOperationGroup, ChatOperationResultAggregator, ChatTextEditOperation, IChatEditOperation, IOperationResult } from './chatEditingSessionV2Operations.js';

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
	private readonly _onDidChangeCheckpoints = observableSignal(this);

	private readonly _canUndo = derived(this, reader => this._currentPosition.read(reader) > 0);
	private readonly _canRedo = derived(this, reader => this._currentPosition.read(reader) < this._operations.read(reader).length);

	public get operations() {
		return this._operations;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) { }

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

			if (ids.has(op.op.id)) {
				if (!op.op.isApplied) {
					const result = await op.op.apply();
					agg.add(result);
					if (!result.success) {
						break;
					}
				}

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

			if (ids.has(op.op.id)) {
				if (op.op.isApplied) {
					const result = await op.op.revert();
					agg.add(result);
					if (!result.success) {
						break;
					}
				}

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
			(!uriSet || Iterable.some(record.op.getAffectedResources(), r => uriSet.has(r)))
		).map(record => record.op);
	}

	async goToOperation(operationId: string): Promise<IOperationResult> {
		const operations = this._operations.get();
		const targetIndex = operations.findIndex(record => record.op.id === operationId);
		if (targetIndex === -1 && operationId !== 'initial') {
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

	get firstCheckpoint() {
		return this._checkpoints.at(0);
	}

	get lastCheckpoint() {
		return this._checkpoints.at(-1);
	}

	createMarkerCheckpoint(requestId: string, checkpointId?: string): IOperationCheckpoint {
		const currentPosition = this._currentPosition.get();
		const operations = this._operations.get();
		const operationId = currentPosition > 0 ?
			operations[currentPosition - 1].op.id : 'initial';

		const checkpoint = new OperationCheckpoint(requestId, checkpointId, operationId, undefined);
		this._checkpoints.push(checkpoint);
		this._onDidChangeCheckpoints.trigger(undefined);
		return checkpoint;
	}

	async createCompleteCheckpoint(includeURIs: ResourceSet, requestId: string, checkpointId?: string): Promise<IOperationCheckpoint> {
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
		this._onDidChangeCheckpoints.trigger(undefined);

		return checkpoint;
	}

	findCheckpoint(requestId: string, checkpointId?: string): IOperationCheckpoint | undefined {
		return this._checkpoints.find(checkpoint =>
			checkpoint.requestId === requestId && checkpoint.checkpointId === checkpointId
		);
	}

	findNextCheckpoint(current: IOperationCheckpoint): IOperationCheckpoint | undefined {
		const index = this._checkpoints.indexOf(current);
		return index === -1 ? undefined : this._checkpoints[index + 1];
	}

	readOnlyAcceptedChanges(resource: URI): IObservable<string | undefined> {
		const checkpoints = new Map(this._checkpoints
			.filter(cp => cp.resources?.has(resource))
			.map(cp => [cp.operationId, cp])
		);

		// Find the first checkpoint before the first unaccepted change for this resource.
		let mostRecentCheckpoint = checkpoints.get('initial')?.resources?.has(resource) ? checkpoints.get('initial')! : undefined;
		for (const operation of this._operations.get()) {
			if (!operation.op.getAffectedResources().has(resource)) {
				continue;
			}

			mostRecentCheckpoint = checkpoints.get(operation.op.id) || mostRecentCheckpoint;

			if (operation.state.get() === ChatEditOperationState.Pending) {
				break;
			}
		}

		if (!mostRecentCheckpoint) {
			return observableValue(this, undefined);
		}

		return this._generateFileBetweenOps(
			resource,
			mostRecentCheckpoint.resources!.get(resource)!,
			mostRecentCheckpoint.operationId,
			undefined,
			(op, r) => op.state.read(r) !== ChatEditOperationState.Pending
		);
	}

	/**
	 * Returns an observable of the file contents including both accepted and pending operations.
	 * This represents the "preview" side in diffing (base + pending edits).
	 */
	readPreview(resource: URI): IObservable<string | undefined> {
		const checkpoints = new Map(this._checkpoints
			.filter(cp => cp.resources?.has(resource))
			.map(cp => [cp.operationId, cp])
		);

		// Find the first checkpoint before the first change for this resource.
		let mostRecentCheckpoint = checkpoints.get('initial')?.resources?.has(resource) ? checkpoints.get('initial')! : undefined;
		for (const operation of this._operations.get()) {
			if (!operation.op.getAffectedResources().has(resource)) {
				continue;
			}

			mostRecentCheckpoint = checkpoints.get(operation.op.id) || mostRecentCheckpoint;
			// For preview, we do not stop at Pending; apply through all operations
		}

		if (!mostRecentCheckpoint) {
			return observableValue(this, undefined);
		}

		return this._generateFileBetweenOps(
			resource,
			mostRecentCheckpoint.resources!.get(resource)!,
			mostRecentCheckpoint.operationId,
			undefined,
			// include all operations after the checkpoint
			undefined
		);
	}

	/**
	 * Normalize all pending text edit operations on the given resource so that
	 * each operation represents exactly one minimal text edit.
	 */
	async normalizePendingTextEditsFor(resource: URI): Promise<void> {
		// Determine base content before we start iterating
		const checkpoints = new Map(this._checkpoints
			.filter(cp => cp.resources?.has(resource))
			.map(cp => [cp.operationId, cp])
		);

		let mostRecentCheckpoint = checkpoints.get('initial')?.resources?.has(resource) ? checkpoints.get('initial')! : undefined;
		const opsArr = this._operations.get();
		// track from the last checkpoint; we rebuild content progressively
		for (let i = 0; i < opsArr.length; i++) {
			const operation = opsArr[i];
			if (!operation.op.getAffectedResources().has(resource)) {
				continue;
			}
			mostRecentCheckpoint = checkpoints.get(operation.op.id) || mostRecentCheckpoint;
			// (no-op) advancing through operations to identify latest checkpoint
			// We continue to the end; we want the last checkpoint before the first change
			// and we will rebuild from there.
		}

		if (!mostRecentCheckpoint) {
			return; // nothing to normalize
		}

		const makeModel = (uri: URI, contents: string) => this._instantiationService.createInstance(TextModel, contents, 'text/plain', this._modelService.getCreationOptions('text/plain', uri, true), uri);

		let model = makeModel(resource, mostRecentCheckpoint.resources!.get(resource)!);
		try {
			const newRecords: IChatEditOptionRecord[] = [];
			for (let i = 0; i < opsArr.length;) {
				const rec = opsArr[i];
				if (!rec.op.getAffectedResources().has(resource)) {
					newRecords.push(rec);
					i++;
					continue;
				}

				// Merge a run of sequential pending text edits targeting the current model
				if (rec.op instanceof ChatTextEditOperation && rec.state.get() === ChatEditOperationState.Pending) {
					// If model was moved earlier, ensure we target the right uri
					const te = rec.op;
					if (model.uri.toString() !== te.targetUri.toString()) {
						model = makeModel(te.targetUri, model.getValue());
					}

					const batchEdits: TextEdit[] = [];
					let lastIsLastEdit = te.isLastEdit;
					const requestId = te.requestId;
					let j = i;
					for (; j < opsArr.length; j++) {
						const r = opsArr[j];
						if (r.op instanceof ChatTextEditOperation && r.state.get() === ChatEditOperationState.Pending) {
							const t = r.op;
							if (t.targetUri.toString() !== model.uri.toString()) {
								break; // different target / after rename
							}
							batchEdits.push(...t.edits);
							lastIsLastEdit = t.isLastEdit || lastIsLastEdit;
						} else {
							break; // non-text op ends batch
						}
					}

					const minimal = await this._editorWorkerService.computeMoreMinimalEdits(model.uri, batchEdits) ?? batchEdits;
					const newOp = this._instantiationService.createInstance(
						ChatTextEditOperation,
						requestId,
						model.uri,
						minimal,
						lastIsLastEdit
					);
					newRecords.push({ op: newOp, state: observableValue(this, ChatEditOperationState.Pending) });
					// Apply combined minimal edits to advance content
					model.applyEdits(minimal);
					i = j; // skip the whole batch
					continue;
				}

				// For other operations, apply to model (may adjust uri) and keep record unchanged
				const result = rec.op.applyTo(model);
				if (result.movedToURI) {
					model = makeModel(result.movedToURI, model.getValue());
				}
				newRecords.push(rec);
				i++;
			}

			this._operations.set(newRecords, undefined);
		} finally {
			model.dispose();
		}
	}

	/** Splits a single pending TextEdit operation into multiple single-edit operations in-place. */
	splitTextEditOperation(opId: string, edits: readonly TextEdit[]): void {
		const ops = this._operations.get();
		const idx = ops.findIndex(r => r.op.id === opId);
		if (idx === -1) { return; }
		const rec = ops[idx];
		if (!(rec.op instanceof ChatTextEditOperation) || rec.state.get() !== ChatEditOperationState.Pending) { return; }
		const te = rec.op;
		const replacements: IChatEditOptionRecord = {
			op: this._instantiationService.createInstance(ChatTextEditOperation, te.requestId, te.targetUri, edits, te.isLastEdit),
			state: observableValue(this, ChatEditOperationState.Pending)
		};
		this._operations.set(ops.slice(0, idx).concat(replacements, ops.slice(idx + 1)), undefined);
	}

	readFileAtCheckpoint(checkpointOrPtr: IOperationCheckpoint | IOperationCheckpointPointer, resource: URI): IObservable<string | undefined> {
		let checkpoint: IOperationCheckpoint;
		let targetOperationId: IObservable<string | undefined>;
		if (IOperationCheckpointPointer.is(checkpointOrPtr)) {
			const maybeCheckpoint = this._checkpoints.find(checkpoint =>
				checkpoint.requestId === checkpointOrPtr.requestId && checkpoint.operationId === checkpointOrPtr.operationId
			);
			if (!maybeCheckpoint) {
				return observableValue(this, undefined);
			}
			checkpoint = maybeCheckpoint;
			// Find the checkpoint pointing to a different operation. This is an observable
			// because the next checkpoint might not yet exist (when pointing to the last operation)
			// with more data added on until it does.
			targetOperationId = this._onDidChangeCheckpoints.map(() => {
				const index = this._checkpoints.indexOf(checkpoint);
				return this._checkpoints.find(c => c.operationId !== checkpoint.operationId, index + 1)?.operationId;
			});
		} else {
			checkpoint = checkpointOrPtr;
			targetOperationId = observableValue(this, checkpointOrPtr.operationId);
		}

		for (let i = this._checkpoints.indexOf(checkpoint); i >= 0; i--) {
			const prior = this._checkpoints[i];
			const contents = prior.resources?.get(resource);
			if (contents) {
				return this._generateFileBetweenOps(resource, contents, prior.operationId, targetOperationId);
			}
		}

		return observableValue(this, undefined);
	}

	private _generateFileBetweenOps(
		resource: URI,
		contentsAtStartingOpId: string,
		startingOpId: string,
		endingOpIdObservable: string | undefined | IObservable<string | undefined>,
		filterOp?: (op: IChatEditOptionRecord, reader: IReader) => boolean,
	): IObservable<string> {
		const edits = derivedOpts<IChatEditOptionRecord[]>({ debugName: '_generateFileFromCheckpoints', equalsFn: arraysEqual }, reader => {
			const ops = this._operations.read(reader);
			const start = startingOpId === 'initial' ? 0 : ops.findIndex(o => o.op.id === startingOpId);

			const endingOpId = typeof endingOpIdObservable === 'object' ? endingOpIdObservable.read(reader) : endingOpIdObservable;
			const end = endingOpId === undefined ? ops.length : ops.findIndex(o => o.op.id === endingOpId, start + 1);
			const filtered = start === -1 || end === -1 ? [] : ops.slice(start, end + 1);

			return filterOp ? filtered.filter(o => filterOp(o, reader)) : filtered;
		});

		const makeModel = (uri: URI, contents: string) => this._instantiationService.createInstance(TextModel, contents, 'text/plain', this._modelService.getCreationOptions('text/plain', uri, true), uri);

		return edits.map(edits => {
			let model = makeModel(resource, contentsAtStartingOpId);
			for (const edit of edits) {
				const r = edit.op.applyTo(model);
				if (r.movedToURI) {
					model = makeModel(r.movedToURI, model.getValue());
				}
			}

			if (resource.toString() !== model.uri.toString()) {
				model.edit(EditorTextEdit.insert(new Position(1, 1), localize(
					'edit.moved',
					'// Moved from {0} to {1}',
					this._labelService.getUriLabel(resource),
					this._labelService.getUriLabel(model.uri),
				)));
			}

			return model.getValue();
		});
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
		public readonly resources?: ResourceMap<string>,
	) { }

	async serialize(): Promise<IOperationCheckpointData> {
		return {
			requestId: this.requestId,
			checkpointId: this.checkpointId,
			operationId: this.operationId,
			resources: this.resources ? [...this.resources].map(([uri, content]) => ({ uri: uri.toString(), content })) : undefined,
		};
	}
}
