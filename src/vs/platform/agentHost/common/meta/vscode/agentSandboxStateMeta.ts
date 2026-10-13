/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const sandboxStateKey = 'vscode.sandboxState';

/** Last successful sandbox application, with failures scoped to the client that requested the change. */
export interface ISessionSandboxState {
	readonly enabled: boolean;
	readonly error?: {
		readonly clientId: string;
		readonly clientSeq: number;
		readonly message: string;
	};
}

export function readSessionSandboxState(source: { readonly _meta?: Record<string, unknown> } | undefined): ISessionSandboxState | undefined {
	const value = source?._meta?.[sandboxStateKey];
	if (!isObject(value)) {
		return undefined;
	}
	const { enabled, error } = value as Record<string, unknown>;
	if (typeof enabled !== 'boolean') {
		return undefined;
	}
	if (error === undefined) {
		return { enabled };
	}
	if (!isObject(error)) {
		return undefined;
	}
	const { clientId, clientSeq, message } = error as Record<string, unknown>;
	if (typeof clientId !== 'string' || typeof clientSeq !== 'number' || !Number.isSafeInteger(clientSeq) || typeof message !== 'string') {
		return undefined;
	}
	return { enabled, error: { clientId, clientSeq, message } };
}

export function withSessionSandboxState(meta: Record<string, unknown> | undefined, state: ISessionSandboxState | undefined): Record<string, unknown> {
	return { ...meta, [sandboxStateKey]: state };
}
