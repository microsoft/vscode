/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonRpcErrorCodes, ProtocolError } from '../state/sessionProtocol.js';

/**
 * createTerminal metadata containing the creating VS Code client's version.
 * Its presence opts into VS Code terminal identity at process creation.
 */
export const VSCODE_TERMINAL_PROGRAM_VERSION_META_KEY = 'vscode.terminalProgramVersion';

export function readTerminalProgramVersionMeta(source: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const version = source._meta?.[VSCODE_TERMINAL_PROGRAM_VERSION_META_KEY];
	if (version !== undefined && (typeof version !== 'string' || version.length === 0 || version.includes('\0'))) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid VS Code terminal version in createTerminal metadata');
	}
	return version;
}
