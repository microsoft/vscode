/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const copilotEntraAuthenticationKey = 'vscode.copilotEntraAuthentication';

export function supportsCopilotEntraAuthentication(source: { readonly _meta?: Record<string, unknown> }): boolean {
	return source._meta?.[copilotEntraAuthenticationKey] === true;
}

export function copilotEntraAuthenticationMeta(): Record<string, unknown> {
	return { [copilotEntraAuthenticationKey]: true };
}
