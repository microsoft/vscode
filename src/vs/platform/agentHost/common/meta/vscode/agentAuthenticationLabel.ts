/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonRpcErrorCodes, ProtocolError } from '../../state/sessionProtocol.js';

const authenticationAccountLabelKey = 'vscode.authentication.accountLabel';

/** Optional display text, never an account identifier or authorization input. */
export function readAuthenticationAccountLabel(source: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const value = source._meta?.[authenticationAccountLabelKey];
	if (value !== undefined && typeof value !== 'string') {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Authentication account label must be a string');
	}
	return value?.trim() ? value : undefined;
}

export function authenticationAccountLabelMeta(label: string): Record<string, unknown> {
	return { [authenticationAccountLabelKey]: label };
}
