/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IMeteredConnectionService } from './meteredConnection.js';

export const METERED_CONNECTION_CHANNEL = 'meteredConnection';

/**
 * Commands supported by the metered connection IPC channel.
 */
export enum MeteredConnectionCommand {
	OnDidChangeIsConnectionMetered = 'OnDidChangeIsConnectionMetered',
	IsConnectionMetered = 'IsConnectionMetered',
}

/**
 * IPC channel client for the metered connection service.
 */
export class MeteredConnectionChannelClient extends Disposable implements IMeteredConnectionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	public readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	private _isConnectionMetered = true;
	public get isConnectionMetered(): boolean {
		return this._isConnectionMetered;
	}

	public readonly whenInitialized: Promise<void>;

	constructor(channel: IChannel) {
		super();

		let receivedEvent = false;
		this._register(channel.listen<boolean>(MeteredConnectionCommand.OnDidChangeIsConnectionMetered)(value => {
			receivedEvent = true;
			if (this._isConnectionMetered !== value) {
				this._isConnectionMetered = value;
				this._onDidChangeIsConnectionMetered.fire(value);
			}
		}));

		this.whenInitialized = channel.call<boolean>(MeteredConnectionCommand.IsConnectionMetered).then(value => {
			if (!receivedEvent) {
				this._isConnectionMetered = value;
			}
		}, error => {
			onUnexpectedError(error);
			if (!receivedEvent) {
				this._isConnectionMetered = false;
			}
		});
	}
}
