/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IRuntimeClientInstance, RuntimeClientState } from './languageRuntimeClientInstance.js';
import { IntrinsicSize, ErdosPlotComm, PlotRenderFormat } from './erdosPlotComm.js';
import { ErdosPlotRenderQueue, IRenderedPlot } from './erdosPlotRenderQueue.js';

export interface DeferredRender {
	id: string;
	size: any;
	pixelRatio: number;
	format: string;
}

export class ErdosPlotCommProxy extends Disposable {
	private _comm: ErdosPlotComm;
	private _intrinsicSize?: IntrinsicSize;
	private _receivedIntrinsicSize = false;
	private _currentIntrinsicSize?: Promise<IntrinsicSize | undefined>;
	private _currentRender?: any;

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
		private readonly _sessionRenderQueue: ErdosPlotRenderQueue
	) {
		super();

		this._comm = this._register(new ErdosPlotComm(client, { render: { timeout: 30000 }, get_intrinsic_size: { timeout: 30000 } }));
		
		this._register(this._closeEmitter);
		this._register(this._renderUpdateEmitter);
		this._register(this._didShowPlotEmitter);
		this._register(this._didSetIntrinsicSizeEmitter);

		// Connect events
		this.onDidClose = this._closeEmitter.event;
		this.onDidRenderUpdate = this._renderUpdateEmitter.event;
		this.onDidShowPlot = this._didShowPlotEmitter.event;
		this.onDidSetIntrinsicSize = this._didSetIntrinsicSizeEmitter.event;

		// Listen for client state changes
		this._register(Event.fromObservable(client.clientState)(state => {
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
				// Cancel any pending renders
				this._currentRender?.cancel();
			}
		}));

		// Listen for comm events
		this._register(this._comm.onDidClose(() => {
			this._closeEmitter.fire();
		}));

		this._register(this._comm.onDidShow(() => {
			this._didShowPlotEmitter.fire();
		}));

		this._register(this._comm.onDidUpdate(() => {
			this._renderUpdateEmitter.fire();
		}));

		this._register(this._comm);
	}

	get clientId(): string {
		return this._comm.clientId;
	}

	async render(size: any, pixelRatio: number = 1, format: string = 'png'): Promise<IRenderedPlot> {
		// Use the render queue to handle the request
		const result = await this._sessionRenderQueue.render(this._comm, size, pixelRatio, format as PlotRenderFormat);
		return result;
	}

	async getIntrinsicSize(): Promise<IntrinsicSize | undefined> {
		if (this._receivedIntrinsicSize) {
			return this._intrinsicSize;
		}

		if (this._currentIntrinsicSize) {
			return this._currentIntrinsicSize;
		}

		this._currentIntrinsicSize = this._comm.getIntrinsicSize();
		this._intrinsicSize = await this._currentIntrinsicSize;
		this._receivedIntrinsicSize = true;
		this._currentIntrinsicSize = undefined;

		return this._intrinsicSize;
	}
}