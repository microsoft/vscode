/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SESSION_IS_PROMOTED_METADATA_KEY = 'vscode.session.isPromoted';

/** Whether the host has promoted this session into the primary sessions list. */
export function readSessionIsPromoted(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[SESSION_IS_PROMOTED_METADATA_KEY] === true;
}

export function withSessionIsPromoted(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	return { ...meta, [SESSION_IS_PROMOTED_METADATA_KEY]: true };
}
