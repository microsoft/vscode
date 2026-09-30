/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const retryOfKey = 'vscode.chat.retryOf';

export function readMessageRetryOf(source: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const value = source._meta?.[retryOfKey];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function withMessageRetryOf(meta: Record<string, unknown> | undefined, requestId: string): Record<string, unknown> {
	return { ...meta, [retryOfKey]: requestId };
}
