/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import { JsonRpcErrorCodes, ProtocolError } from '../state/sessionProtocol.js';

const TERMINAL_PROGRAM_META_KEY = 'vscode.terminalProgram';

/** Launch-time terminal application identity, independent of subsequent viewers or claims. */
export interface ITerminalProgram {
	readonly name: string;
	readonly version?: string;
}

/** Opts a createTerminal request into setting TERM_PROGRAM and TERM_PROGRAM_VERSION. */
export function toTerminalProgramMeta(program: ITerminalProgram): Record<string, unknown> {
	return { [TERMINAL_PROGRAM_META_KEY]: program };
}

/** Reads launch-time identity; an unmarked request retains the host's inherited environment. */
export function readTerminalProgramMeta(source: { readonly _meta?: Record<string, unknown> }): ITerminalProgram | undefined {
	const value = source._meta?.[TERMINAL_PROGRAM_META_KEY];
	if (value === undefined) {
		return undefined;
	}
	if (!hasTerminalProgramName(value) || !isTerminalProgramValue(value.name)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid terminal program name in createTerminal metadata');
	}
	const version = value.version;
	if (version !== undefined && !isTerminalProgramValue(version)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid terminal program version in createTerminal metadata');
	}
	return { name: value.name, version };
}

function hasTerminalProgramName(value: unknown): value is { readonly name: unknown; readonly version?: unknown } {
	return typeof value === 'object' && value !== null && hasKey(value, { name: true });
}

function isTerminalProgramValue(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}
