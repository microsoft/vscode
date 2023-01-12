/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';

export interface IRemoteTunnelAccount {
	readonly providerId: string;
	readonly token: string;
	readonly accountLabel: string;
}

export const IRemoteTunnelService = createDecorator<IRemoteTunnelService>('IRemoteTunnelService');
export interface IRemoteTunnelService {
	readonly _serviceBrand: undefined;

	readonly onDidTokenFailed: Event<boolean>;

	readonly onDidChangeTunnelStatus: Event<TunnelStatus>;
	getTunnelStatus(): Promise<TunnelStatus>;

	getAccount(): Promise<IRemoteTunnelAccount | undefined>;
	readonly onDidChangeAccount: Event<IRemoteTunnelAccount | undefined>;
	updateAccount(account: IRemoteTunnelAccount | undefined): Promise<TunnelStatus>;

	getHostName(): Promise<string | undefined>;

}

export type TunnelStatus = TunnelStates.Connected | TunnelStates.Disconnected | TunnelStates.Connecting | TunnelStates.Uninitialized;

export namespace TunnelStates {
	export interface Uninitialized {
		readonly type: 'uninitialized';
	}
	export interface Connecting {
		readonly type: 'connecting';
		readonly progress?: string;
	}
	export interface Connected {
		readonly type: 'connected';
		readonly info: ConnectionInfo;
	}
	export interface Disconnected {
		readonly type: 'disconnected';
	}

	export const disconnected: Disconnected = { type: 'disconnected' };
	export const uninitialized: Uninitialized = { type: 'uninitialized' };
	export const connected = (info: ConnectionInfo): Connected => ({ type: 'connected', info });
	export const connecting = (progress?: string): Connecting => ({ type: 'connecting', progress });

}

export interface ConnectionInfo {
	link: string;
	domain: string;
	hostName: string;
}

export const CONFIGURATION_KEY_PREFIX = 'remote.tunnels.access';
export const CONFIGURATION_KEY_HOST_NAME = CONFIGURATION_KEY_PREFIX + '.hostNameOverride';

export const LOG_FILE_NAME = 'remoteTunnelService.log';
export const LOGGER_NAME = localize('remoteTunnelLog', "Remote Tunnel Service");
export const LOG_CHANNEL_ID = 'remoteTunnelServiceLog';
