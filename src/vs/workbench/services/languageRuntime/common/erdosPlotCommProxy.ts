/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IRuntimeClientInstance, RuntimeClientState } from './languageRuntimeClientInstance.js';
import { IntrinsicSize, ErdosPlotComm, UpdateEvent } from './erdosPlotComm.js';
import { ErdosPlotRenderQueue, DeferredRender } from './erdosPlotRenderQueue.js';

export class ErdosPlotCommProxy extends Disposable {
	private _comm: ErdosPlotComm;
	private _intrinsicSize?: IntrinsicSize;
	private _receivedIntrinsicSize = false;
	private _currentIntrinsicSize?: Promise<IntrinsicSize | undefined>;
	private _currentRender?: any;

	onDidClose: Event<void>;
	private readonly _closeEmitter = new Emitter<void>();

	onDidRenderUpdate: Event<UpdateEvent>;
	private readonly _renderUpdateEmitter = new Emitter<UpdateEvent>();

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

		this._register(this._comm.onDidUpdate((evt) => {
			this._renderUpdateEmitter.fire(evt);
		}));

		this._register(this._comm);
	}

	get clientId(): string {
		return this._comm.clientId;
	}

	/**
	 * Returns the intrinsic size of the plot, if known.
	 */
	get intrinsicSize(): IntrinsicSize | undefined {
		return this._intrinsicSize;
	}

	/**
	 * Returns a boolean indicating whether this plot has a known intrinsic size.
	 */
	get receivedIntrinsicSize(): boolean {
		return this._receivedIntrinsicSize;
	}

	/**
	 * Renders a plot. The request is queued if a render is already in progress.
	 *
	 * @param request The render request to perform
	 */
	public render(request: DeferredRender): void {
		this._currentRender = request;

		// The session render queue will handle scheduling and rendering
		this._sessionRenderQueue.queue(request, this._comm);
	}

	/**
	 * Get the intrinsic size of the plot, if known.
	 *
	 * @returns A promise that resolves to the intrinsic size of the plot, if known.
	 */
	public getIntrinsicSize(): Promise<IntrinsicSize | undefined> {
		// If there's already an in-flight request, return its response.
		if (this._currentIntrinsicSize) {
			return this._currentIntrinsicSize;
		}

		// If we have already received the intrinsic size, return it immediately.
		if (this._receivedIntrinsicSize) {
			return Promise.resolve(this._intrinsicSize);
		}

		// Use the session render queue to ensure operations don't overlap
		this._currentIntrinsicSize = this._sessionRenderQueue.queueIntrinsicSizeRequest(this._comm)
			.then((intrinsicSize) => {
				this._intrinsicSize = intrinsicSize;
				this._receivedIntrinsicSize = true;
				this._didSetIntrinsicSizeEmitter.fire(intrinsicSize);
				return intrinsicSize;
			})
			.finally(() => {
				this._currentIntrinsicSize = undefined;
			});
		return this._currentIntrinsicSize;
	}
}