/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { removeAnsiEscapeCodes } from '../../../base/common/strings.js';

export const TUNNEL_MACHINE_STATUS_PREFIX = '__VSCODE_CLI_STATUS__';

export interface IConnectedTunnelMachineStatus {
	readonly type: 'connected';
	readonly tunnelName: string;
	readonly tunnelId?: string;
	readonly isAttached: boolean;
	readonly link?: string;
	readonly domain?: string;
}

export interface ITokenErrorTunnelMachineStatus {
	readonly type: 'tokenError';
	readonly message: string;
}

export type TunnelMachineStatus = IConnectedTunnelMachineStatus | ITokenErrorTunnelMachineStatus;

/** Parses a machine-status line emitted by the tunnel CLI. */
export function parseTunnelMachineStatus(message: string): TunnelMachineStatus | undefined {
	const cleanedMessage = removeAnsiEscapeCodes(message);
	if (!cleanedMessage.startsWith(TUNNEL_MACHINE_STATUS_PREFIX)) {
		return undefined;
	}

	let value: unknown;
	try {
		value = JSON.parse(cleanedMessage.slice(TUNNEL_MACHINE_STATUS_PREFIX.length));
	} catch {
		return undefined;
	}

	if (!isRecord(value) || !isString(value.type)) {
		return undefined;
	}

	if (value.type === 'connected') {
		if (!isString(value.tunnelName) || typeof value.isAttached !== 'boolean'
			|| (value.tunnelId !== undefined && !isString(value.tunnelId))
			|| (value.link !== undefined && !isString(value.link))
			|| (value.domain !== undefined && !isString(value.domain))
			|| (value.link === undefined) !== (value.domain === undefined)) {
			return undefined;
		}
		return {
			type: 'connected',
			tunnelName: value.tunnelName,
			...(value.tunnelId === undefined ? {} : { tunnelId: value.tunnelId }),
			isAttached: value.isAttached,
			...(value.link === undefined ? {} : { link: value.link, domain: value.domain }),
		};
	}

	if (value.type === 'tokenError' && isString(value.message)) {
		return { type: 'tokenError', message: value.message };
	}

	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}
