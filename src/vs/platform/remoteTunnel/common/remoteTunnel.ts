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
	link?: string;
	domain?: string;
	tunnelName: string;
	tunnelId?: string;
	isAttached: boolean;
}

export const CONFIGURATION_KEY_PREFIX = 'remote.tunnels.access';
export const CONFIGURATION_KEY_HOST_NAME = CONFIGURATION_KEY_PREFIX + '.hostNameOverride';
export const CONFIGURATION_KEY_PREVENT_SLEEP = CONFIGURATION_KEY_PREFIX + '.preventSleep';

/** Maximum length of a dev tunnel name, matching `MAX_TUNNEL_NAME_LENGTH` in the CLI's `cli/src/tunnels/dev_tunnels.rs`. */
export const MAX_TUNNEL_NAME_LENGTH = 20;

/** Stand-in the CLI uses when a host name cleans down to almost nothing. */
const TUNNEL_NAME_PLACEHOLDER = 'remote-machine';

/**
 * Derive a dev tunnel name from a machine's host name, mirroring
 * `clean_hostname_for_tunnel` and `get_placeholder_name` in the CLI's
 * `cli/src/tunnels/dev_tunnels.rs`: `-`, `_` and spaces all collapse to `-`,
 * anything non-alphanumeric is dropped, and dashes are trimmed from both ends.
 *
 * `code tunnel` and in-editor remote session hosting must derive the same name
 * for a machine, otherwise each registers its own dev tunnel for it.
 */
export function tunnelNameFromHostname(hostname: string): string {
	let cleaned = '';
	for (const char of Array.from(hostname).slice(0, 60)) {
		if (char === '-' || char === '_' || char === ' ') {
			cleaned += '-';
		} else if (/[0-9a-zA-Z]/.test(char)) {
			cleaned += char;
		}
	}

	const trimmed = cleaned.replace(/^-+|-+$/g, '');
	const name = trimmed.length < 2 ? TUNNEL_NAME_PLACEHOLDER : trimmed;
	return name.toLowerCase().substring(0, MAX_TUNNEL_NAME_LENGTH);
}

/**
 * Normalize an explicitly configured tunnel name. The CLI only lowercases and
 * validates a name the user supplied rather than rewriting it (`is_valid_name`),
 * so the sanitization here stays minimal; host names go through
 * {@link tunnelNameFromHostname} instead.
 */
export function normalizeTunnelName(name: string): string {
	return name.replace(/^-+/g, '').replace(/[^\w-]/g, '').substring(0, MAX_TUNNEL_NAME_LENGTH).toLowerCase();
}

export const LOG_ID = 'remoteTunnelService';
export const LOGGER_NAME = localize('remoteTunnelLog', "Remote Tunnel Service");
