/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ISettableObservable } from '../../../../../base/common/observableInternal/base.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { 
	IRuntimeClientInstance, 
	IRuntimeClientOutput, 
	RuntimeClientState, 
	RuntimeClientStatus, 
	RuntimeClientType 
} from '../../common/languageRuntimeClientInstance.js';
import { ILanguageRuntimeMessageState } from '../../common/languageRuntimeService.js';

export class TestRuntimeClientInstance extends Disposable implements IRuntimeClientInstance<any, any> {
	private readonly _onDidReceiveData = this._register(new Emitter<IRuntimeClientOutput<any>>());
	readonly onDidReceiveData: Event<IRuntimeClientOutput<any>> = this._onDidReceiveData.event;

	readonly messageCounter: ISettableObservable<number> = observableValue('messageCounter', 0);
	readonly clientState: ISettableObservable<RuntimeClientState> = observableValue('clientState', RuntimeClientState.Connected);
	readonly clientStatus: ISettableObservable<RuntimeClientStatus> = observableValue('clientStatus', RuntimeClientStatus.Idle);

	constructor(private readonly _clientId: string) {
		super();
	}

	getClientId(): string {
		return this._clientId;
	}

	getClientType(): RuntimeClientType {
		return RuntimeClientType.Ui;
	}

	async performRpcWithBuffers(request: any, timeout: number): Promise<IRuntimeClientOutput<any>> {
		return {
			data: { result: 'test response' },
			buffers: []
		};
	}

	async performRpc(request: any, timeout: number | undefined, responseKeys: Array<string>): Promise<any> {
		return { result: 'test response' };
	}

	sendMessage(message: any, buffers?: VSBuffer[]): void {
		this._onDidReceiveData.fire({
			data: message,
			buffers: buffers
		});
	}

	updatePendingRpcState(message: ILanguageRuntimeMessageState): void {
	}

	override dispose(): void {
		this.clientState.set(RuntimeClientState.Closed, undefined);
		super.dispose();
	}
}
