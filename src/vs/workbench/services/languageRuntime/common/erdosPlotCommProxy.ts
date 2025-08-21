/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IRuntimeClientInstance, RuntimeClientState } from './languageRuntimeClientInstance.js';
import { IntrinsicSize, ErdosPlotComm } from './erdosPlotComm.js';

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

	onDidClose: Event<void>;
	private readonly _closeEmitter = new Emitter<void>();

	onDidUpdate: Event<void>;
	private readonly _updateEmitter = new Emitter<void>();

	constructor(
		client: IRuntimeClientInstance<any, any>
	) {
		super();

		this._comm = this._register(new ErdosPlotComm(client));
		this.onDidClose = this._closeEmitter.event;
		this.onDidUpdate = this._updateEmitter.event;

		this._register(this._comm.onDidShowPlot(() => {
			this._updateEmitter.fire();
		}));

		this._register(this._comm.onDidUpdatePlot(() => {
			this._updateEmitter.fire();
		}));

		this._register(Event.fromObservable(client.clientState)(state => {
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
			}
		}));
	}

	get clientId(): string {
		return this._comm.clientId;
	}

	async render(size: any, pixelRatio: number = 1, format: string = 'png'): Promise<any> {
		const result = await this._comm.render(size, pixelRatio, format as any);
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