/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IRuntimeClientInstance, RuntimeClientState } from './languageRuntimeClientInstance.js';
import { IntrinsicSize, ErdosPlotComm } from './erdosPlotComm.js';
interface DeferredRender {
	cancel(): void;
}

interface ErdosPlotRenderQueue {
	queueIntrinsicSizeRequest(comm: ErdosPlotComm): Promise<IntrinsicSize | undefined>;
	queue(request: DeferredRender, comm: ErdosPlotComm): void;
}

export class ErdosPlotCommProxy extends Disposable {
	private _currentRender?: DeferredRender;
	private _comm: ErdosPlotComm;
	private _intrinsicSize?: IntrinsicSize;
	private _receivedIntrinsicSize = false;
	private _currentIntrinsicSize?: Promise<IntrinsicSize | undefined>;

	onDidClose: Event<void>;
	private readonly _closeEmitter = new Emitter<void>();

	onDidRenderUpdate: Event<void>;
	private readonly _renderUpdateEmitter = new Emitter<void>();

	onDidShowPlot: Event<void>;
	private readonly _didShowPlotEmitter = new Emitter<void>();

	onDidSetIntrinsicSize: Event<IntrinsicSize | undefined>;
	private readonly _didSetIntrinsicSizeEmitter = new Emitter<IntrinsicSize | undefined>();

	constructor(
		client: IRuntimeClientInstance<any, any>,
		private readonly _sessionRenderQueue: ErdosPlotRenderQueue) {
		super();

		this._comm = new ErdosPlotComm(client, { render: { timeout: 30000 }, get_intrinsic_size: { timeout: 30000 } });

		this._register(this._closeEmitter);
		this._register(this._renderUpdateEmitter);
		this._register(this._didShowPlotEmitter);
		this._register(this._didSetIntrinsicSizeEmitter);

		const clientStateEvent = Event.fromObservable(client.clientState);

		this.onDidClose = this._closeEmitter.event;
		this._register(clientStateEvent((state) => {
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
				this._currentRender?.cancel();
			}
		}));

		this.onDidRenderUpdate = this._renderUpdateEmitter.event;
		this.onDidShowPlot = this._didShowPlotEmitter.event;
		this.onDidSetIntrinsicSize = this._didSetIntrinsicSizeEmitter.event;

		this._register(this._comm.onDidClose(() => {
			this._closeEmitter.fire();
		}));

		this._register(this._comm.onDidShow(() => {
			this._didShowPlotEmitter.fire();
		}));

		this._register(this._comm.onDidUpdate((_evt) => {
			this._renderUpdateEmitter.fire();
		}));

		this._register(this._comm);
	}

	get intrinsicSize(): IntrinsicSize | undefined {
		return this._intrinsicSize;
	}

	get receivedIntrinsicSize(): boolean {
		return this._receivedIntrinsicSize;
	}

	public getIntrinsicSize(): Promise<IntrinsicSize | undefined> {
		if (this._currentIntrinsicSize) {
			return this._currentIntrinsicSize;
		}

		if (this._receivedIntrinsicSize) {
			return Promise.resolve(this._intrinsicSize);
		}

		this._currentIntrinsicSize = this._sessionRenderQueue.queueIntrinsicSizeRequest(this._comm)
			.then((intrinsicSize: IntrinsicSize | undefined) => {
				this._intrinsicSize = intrinsicSize;
				this._receivedIntrinsicSize = true;
				this._didSetIntrinsicSizeEmitter.fire(intrinsicSize);
				return intrinsicSize;
			})
			.finally(() => {
				this._currentIntrinsicSize = undefined;
			});
		return this._currentIntrinsicSize!;
	}

	public render(request: DeferredRender): void {
		this._currentRender = request;
		this._sessionRenderQueue.queue(request, this._comm);
	}
}
