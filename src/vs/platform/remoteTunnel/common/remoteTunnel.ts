/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';


export interface IRemoteTunnelAccount {
	readonly authenticationProviderId: string;
	readonly token: string;
}

export const IRemoteTunnelService = createDecorator<IRemoteTunnelService>('IRemoteTunnelService');
export interface IRemoteTunnelService {
	readonly _serviceBrand: undefined;

	readonly onDidTokenFailed: Event<boolean>;
	readonly onDidChangeTunnelStatus: Event<TunnelStatus>;

	getAccount(): Promise<IRemoteTunnelAccount | undefined>;
	readonly onDidChangeAccount: Event<IRemoteTunnelAccount | undefined>;
	updateAccount(account: IRemoteTunnelAccount | undefined): Promise<void>;

}

export const enum TunnelStatus {
	Uninitialized = 'uninitialized',
	Disconnected = 'disconnected',
	Connecting = 'connecting',
	Connected = 'connected',
}
