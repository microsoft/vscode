/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';
import { localize } from '../../../nls.js';

export interface IRemoteTunnelSession {
	readonly providerId: string;
	readonly sessionId: string;
	readonly accountLabel: string;
	readonly token?: string;
}

export const IRemoteTunnelService = createDecorator<IRemoteTunnelService>('IRemoteTunnelService');
export interface IRemoteTunnelService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTunnelStatus: Event<TunnelStatus>;
	getTunnelStatus(): Promise<TunnelStatus>;

	getMode(): Promise<TunnelMode>;
	readonly onDidChangeMode: Event<TunnelMode>;

	readonly onDidTokenFailed: Event<IRemoteTunnelSession | undefined>;
	initialize(mode: TunnelMode): Promise<TunnelStatus>;

	startTunnel(mode: ActiveTunnelMode): Promise<TunnelStatus>;
	stopTunnel(): Promise<void>;
	getTunnelName(): Promise<string | undefined>;

}

export interface ActiveTunnelMode {
	readonly active: true;
	readonly session: IRemoteTunnelSession;
	readonly asService: boolean;
}

export interface InactiveTunnelMode {
	readonly active: false;
}

export const INACTIVE_TUNNEL_MODE: InactiveTunnelMode = { active: false };

/** Saved mode for the tunnel. */
export type TunnelMode = ActiveTunnelMode | InactiveTunnelMode;

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
		readonly serviceInstallFailed: boolean;
	}
	export interface Disconnected {
		readonly type: 'disconnected';
		readonly onTokenFailed?: IRemoteTunnelSession;
	}
	export const disconnected = (onTokenFailed?: IRemoteTunnelSession): Disconnected => ({ type: 'disconnected', onTokenFailed });
	export const connected = (info: ConnectionInfo, serviceInstallFailed: boolean): Connected => ({ type: 'connected', info, serviceInstallFailed });
	export const connecting = (progress?: string): Connecting => ({ type: 'connecting', progress });
	export const uninitialized: Uninitialized = { type: 'uninitialized' };

}

export interface ConnectionInfo {
	link: string;
	domain: string;
	tunnelName: string;
	isAttached: boolean;
}

export const CONFIGURATION_KEY_PREFIX = 'remote.tunnels.access';
export const CONFIGURATION_KEY_HOST_NAME = CONFIGURATION_KEY_PREFIX + '.hostNameOverride';
export const CONFIGURATION_KEY_PREVENT_SLEEP = CONFIGURATION_KEY_PREFIX + '.preventSleep';

/** Maximum length of a dev tunnel name, matching `MAX_TUNNEL_NAME_LENGTH` in the CLI's `cli/src/tunnels/dev_tunnels.rs`. */
export const MAX_TUNNEL_NAME_LENGTH = 20;

/**
 * Normalize a machine name into a dev tunnel name, matching the normalization
 * the CLI performs in `cli/src/tunnels/dev_tunnels.rs` (notably the
 * `to_ascii_lowercase()` calls). Both `code tunnel` and in-editor remote
 * session hosting must derive the same name for a given machine, otherwise
 * they register two dev tunnels that differ only by casing.
 */
export function normalizeTunnelName(name: string): string {
	return name.replace(/^-+/g, '').replace(/[^\w-]/g, '').substring(0, MAX_TUNNEL_NAME_LENGTH).toLowerCase();
}

export const LOG_ID = 'remoteTunnelService';
export const LOGGER_NAME = localize('remoteTunnelLog', "Remote Tunnel Service");
