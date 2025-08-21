/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISettableObservable } from '../../../../base/common/observableInternal/base.js';
import { ILanguageRuntimeMessageState } from './languageRuntimeService.js';

export enum RuntimeClientState {
	Uninitialized = 'uninitialized',
	Opening = 'opening',
	Connected = 'connected',
	Closing = 'closing',
	Closed = 'closed',
}

export enum RuntimeClientStatus {
	Idle = 'idle',
	Busy = 'busy',
	Disconnected = 'closed',
}

export enum RuntimeClientType {
	Lsp = 'erdos.lsp',
	Dap = 'erdos.dap',
	Plot = 'erdos.plot',
	Ui = 'erdos.ui',
	Help = 'erdos.help',
	Connection = 'erdos.connection',
	Reticulate = 'erdos.reticulate',
	IPyWidget = 'jupyter.widget',
	IPyWidgetControl = 'jupyter.widget.control',
}

export interface IRuntimeClientOutput<T> {
	data: T;
	buffers?: Array<VSBuffer>;
}

export interface IRuntimeClientInstance<Input, Output> extends Disposable {
	onDidReceiveData: Event<IRuntimeClientOutput<Output>>;
	getClientId(): string;
	getClientType(): RuntimeClientType;
	performRpcWithBuffers(request: Input, timeout: number): Promise<IRuntimeClientOutput<Output>>;
	performRpc(request: Input, timeout: number | undefined, responseKeys: Array<string>): Promise<Output>;
	sendMessage(message: any, buffers?: VSBuffer[]): void;
	messageCounter: ISettableObservable<number>;
	clientState: ISettableObservable<RuntimeClientState>;
	clientStatus: ISettableObservable<RuntimeClientStatus>;
	updatePendingRpcState(message: ILanguageRuntimeMessageState): void;
}
