/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Event } from '../../../../base/common/event.js';
import { RuntimeState } from './languageRuntimeService.js';



interface ILanguageRuntimeSession {
	sessionId: string;
	onDidChangeRuntimeState: Event<void>;
	getRuntimeState(): RuntimeState;
}
import { PlotRenderFormat, ErdosPlotComm, IntrinsicSize, PlotSize } from './erdosPlotComm.js';

export enum OperationType {
	Render = 'render',
	GetIntrinsicSize = 'get_intrinsic_size'
}

export type PlotOperationResult = IRenderedPlot | IntrinsicSize | undefined;

export interface IRenderedPlot {
	size?: PlotSize;
	pixel_ratio: number;
	uri: string;
	renderTimeMs: number;
	intrinsic_size?: IntrinsicSize;
}

export interface PlotOperationRequest {
	type: OperationType;
	size?: PlotSize;
	pixel_ratio?: number;
	format?: PlotRenderFormat;
}

export interface RenderRequest {
	size?: PlotSize;
	pixel_ratio: number;
	format: PlotRenderFormat;
}

export class DeferredPlotOperation {
	private readonly deferred: DeferredPromise<PlotOperationResult>;

	constructor(public readonly operationRequest: PlotOperationRequest) {
		this.deferred = new DeferredPromise<PlotOperationResult>();
	}

	get isComplete(): boolean {
		return this.deferred.isSettled;
	}

	cancel(): void {
		this.deferred.cancel();
	}

	error(err: Error): void {
		this.deferred.error(err);
	}

	complete(result: PlotOperationResult): void {
		this.deferred.complete(result);
	}

	get promise(): Promise<PlotOperationResult> {
		return this.deferred.p;
	}
}

export class DeferredRender {
	private readonly deferred: DeferredPromise<IRenderedPlot>;

	constructor(public readonly renderRequest: RenderRequest) {
		this.deferred = new DeferredPromise<IRenderedPlot>();
	}

	get isComplete(): boolean {
		return this.deferred.isSettled;
	}

	cancel(): void {
		this.deferred.cancel();
	}

	error(err: Error): void {
		this.deferred.error(err);
	}

	complete(plot: IRenderedPlot): void {
		this.deferred.complete(plot);
	}

	get promise(): Promise<IRenderedPlot> {
		return this.deferred.p;
	}
}

export class QueuedOperation {
	constructor(
		public readonly operation: DeferredPlotOperation,
		public readonly comm: ErdosPlotComm) {
	}
}

export class QueuedRender {
	constructor(
		public readonly render: DeferredRender,
		public readonly comm: ErdosPlotComm) {
	}
}

export class ErdosPlotRenderQueue extends Disposable {
	private readonly _queue: QueuedOperation[] = [];
	private _isProcessing = false;
	private readonly _commCloseListeners = new Map<string, IDisposable>();

	constructor(
		private readonly _session: ILanguageRuntimeSession,
		private readonly _logService: ILogService
	) {
		super();
		this.trace(`Initializing`);
		this._register(this._session.onDidChangeRuntimeState(() => {

			if (this._session.getRuntimeState() === RuntimeState.Idle ||
				this._session.getRuntimeState() === RuntimeState.Ready) {
				if (this._queue.length > 0) {
					this.trace(`Runtime ready, processing queue.`);
					this.processQueue();
				}
			} else if (this._session.getRuntimeState() === RuntimeState.Exited) {
				this._queue.forEach((queuedOperation) => {
					queuedOperation.operation.cancel();
					this.trace(
						`Runtime exited, cancelling operation: ` +
						`${JSON.stringify(queuedOperation.operation.operationRequest)} (${queuedOperation.comm.clientId})`);
				});
				this._queue.length = 0;
			}
		}));
	}

	public queueOperation(request: PlotOperationRequest, comm: ErdosPlotComm): DeferredPlotOperation {
		const deferredOperation = new DeferredPlotOperation(request);
		this._queue.push(new QueuedOperation(deferredOperation, comm));

		this.ensureCommCloseListener(comm);

		this.trace(
			`Received request for ${request.type} operation: ` +
			JSON.stringify(request) +
			` (${comm.clientId}); queue length: ${this._queue.length})`);

		if (this._session.getRuntimeState() === RuntimeState.Idle || this._session.getRuntimeState() === RuntimeState.Ready) {
			this.processQueue();
		}
		return deferredOperation;
	}

	public queue(deferredRender: DeferredRender, comm: ErdosPlotComm): DeferredRender {

		this.cancelExistingOperations(comm, OperationType.Render);

		const operationRequest: PlotOperationRequest = {
			type: OperationType.Render,
			size: deferredRender.renderRequest.size,
			pixel_ratio: deferredRender.renderRequest.pixel_ratio,
			format: deferredRender.renderRequest.format
		};

		const deferredOperation = this.queueOperation(operationRequest, comm);

		deferredOperation.promise.then((result) => {
			if (result && typeof result === 'object' && 'uri' in result) {
				deferredRender.complete(result as IRenderedPlot);
			} else {
				deferredRender.error(new Error('Invalid render result'));
			}
		}).catch((err) => {
			deferredRender.error(err);
		});

		return deferredRender;
	}

	public queueIntrinsicSizeRequest(comm: ErdosPlotComm): Promise<IntrinsicSize | undefined> {
		this.cancelExistingOperations(comm, OperationType.GetIntrinsicSize);

		const operationRequest: PlotOperationRequest = {
			type: OperationType.GetIntrinsicSize
		};

		const deferredOperation = this.queueOperation(operationRequest, comm);
		return deferredOperation.promise.then((result) => {
			if (result === null) {
				return undefined;
			} else if (result === undefined ||
				(typeof result === 'object' && 'width' in result && 'height' in result)) {
				return result as IntrinsicSize | undefined;
			} else {
				throw new Error('Invalid intrinsic size result');
			}
		});
	}

	private cancelExistingOperations(comm: ErdosPlotComm, operationType: OperationType): void {
		for (let i = this._queue.length - 1; i >= 0; i--) {
			const queuedOperation = this._queue[i];

			if (queuedOperation.comm.clientId === comm.clientId &&
				queuedOperation.operation.operationRequest.type === operationType) {

				queuedOperation.operation.cancel();
				this._queue.splice(i, 1);

				this.trace(`Cancelled existing ${operationType} operation for plot ${comm.clientId}`);
			}
		}
	}

	private processQueue(): void {
		if (this._queue.length === 0) {
			this._isProcessing = false;
			this.cleanupUnusedCloseListeners();
			return;
		}

		if (this._isProcessing) {
			return;
		}

		this._isProcessing = true;
		const queuedOperation = this._queue.shift();
		if (!queuedOperation) {
			this._isProcessing = false;
			return;
		}

		this.trace(`Processing ${queuedOperation.operation.operationRequest.type} request: ` +
			`${JSON.stringify(queuedOperation.operation.operationRequest)} ` +
			`(${queuedOperation.comm.clientId}); queue length: ${this._queue.length})`);

		const startedTime = Date.now();
		const operationRequest = queuedOperation.operation.operationRequest;

		if (operationRequest.type === OperationType.Render) {
			queuedOperation.comm.render(operationRequest.size,
				operationRequest.pixel_ratio!,
				operationRequest.format!).then((response) => {
					const finishedTime = Date.now();
					const renderTimeMs = finishedTime - startedTime;

					const uri = `data:${response.mime_type};base64,${this.padBase64(response.data)}`;
					const renderResult: IRenderedPlot = {
						size: operationRequest.size,
						pixel_ratio: operationRequest.pixel_ratio!,
						uri,
						renderTimeMs
					};
					queuedOperation.operation.complete(renderResult);
				}).catch((err) => {
					queuedOperation.operation.error(err);
				}).finally(() => {
					this._isProcessing = false;
					this.processQueue();
				});
		} else if (operationRequest.type === OperationType.GetIntrinsicSize) {
			queuedOperation.comm.getIntrinsicSize().then((intrinsicSize) => {
				queuedOperation.operation.complete(intrinsicSize);
			}).catch((err) => {
				queuedOperation.operation.error(err);
			}).finally(() => {
				this._isProcessing = false;
				this.processQueue();
			});
		} else {
			queuedOperation.operation.error(new Error(`Unknown operation type: ${operationRequest.type}`));
			this._isProcessing = false;
			this.processQueue();
		}
	}

	private padBase64(base64: string): string {
		const remainder = base64.length % 4;
		if (remainder === 0) {
			return base64;
		} else {
			return `${base64}${'='.repeat(4 - remainder)}`;
		}
	}

	private trace(message: string): void {
		this._logService.trace(`[RenderQueue ${this._session.sessionId}] ${message}`);
	}

	private ensureCommCloseListener(comm: ErdosPlotComm): void {
		const clientId = comm.clientId;

		if (this._commCloseListeners.has(clientId)) {
			return;
		}

		const closeListener = comm.onDidClose(() => {
			this.cancelOperationsForClosedComm(clientId);
			this._commCloseListeners.delete(clientId);
		});
		this._commCloseListeners.set(clientId, closeListener);
	}

	private cancelOperationsForClosedComm(clientId: string): void {
		let cancelledCount = 0;

		for (let i = this._queue.length - 1; i >= 0; i--) {
			const queuedOperation = this._queue[i];

			if (queuedOperation.comm.clientId === clientId) {
				queuedOperation.operation.cancel();
				this._queue.splice(i, 1);
				cancelledCount++;
			}
		}

		if (cancelledCount > 0) {
			this.trace(`Cancelled ${cancelledCount} operations for closed comm ${clientId}`);
		}
	}

	private cleanupUnusedCloseListeners(): void {
		const activeCommIds = new Set(this._queue.map(op => op.comm.clientId));

		const unusedListeners: string[] = [];
		for (const [clientId] of this._commCloseListeners) {
			if (!activeCommIds.has(clientId)) {
				unusedListeners.push(clientId);
			}
		}

		for (const clientId of unusedListeners) {
			const listener = this._commCloseListeners.get(clientId);
			if (listener) {
				listener.dispose();
				this._commCloseListeners.delete(clientId);
			}
		}
	}

	override dispose(): void {
		for (const queuedOperation of this._queue) {
			queuedOperation.operation.cancel();
		}
		this._queue.length = 0;

		for (const [clientId, listener] of this._commCloseListeners) {
			listener.dispose();
			this.trace(`Cleaned up close listener for comm ${clientId}`);
		}
		this._commCloseListeners.clear();

		super.dispose();
	}
}
